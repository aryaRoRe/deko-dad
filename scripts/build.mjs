import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { assetFiles } from '../core.mjs';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/server/', root);
await mkdir(dist, { recursive: true });
const files = [...new Set(Object.values(assetFiles).map(([file]) => file))];
const assets = Object.fromEntries(await Promise.all(files.map(async file => [
  file, (await readFile(new URL('public/' + file, root))).toString('base64'),
])));
const worker = [
  'import { createDekoApp } from "../../core.mjs";',
  'import { sameSecret } from "../../telegram.mjs";',
  'const assets = ' + JSON.stringify(assets) + ';',
  'const applications = new WeakMap();',
  'const textEncoder = new TextEncoder();',
  'const hash = async text => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(text)))));',
  'function appFor(env) {',
  '  let app = applications.get(env);',
  '  if (app) return app;',
  '  const password = env.DEKO_TEAM_PASSWORD;',
  '  app = createDekoApp({',
  '    origin: env.DEKO_PUBLIC_ORIGIN,',
  '    embedOrigins: (env.DEKO_EMBED_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean),',
  '    loadAsset: file => Uint8Array.from(atob(assets[file]), character => character.charCodeAt(0)),',
  '    verifyTeamPassword: typeof password === "string" && password.length >= 16',
  '      ? async value => sameSecret(await hash(value), await hash(password)) : null,',
  '    telegramOptions: { botToken: env.TELEGRAM_BOT_TOKEN, webhookSecret: env.TELEGRAM_WEBHOOK_SECRET },',
  '  });',
  '  applications.set(env, app);',
  '  return app;',
  '}',
  'export default {',
  '  async fetch(request, env, ctx) {',
  '    try {',
  '      return await appFor(env)(request, env.DB, request.headers.get("cf-connecting-ip") ?? "local", task => ctx.waitUntil(task));',
  '    } catch {',
  '      return Response.json({ error: "configuration" }, { status: 503 });',
  '    }',
  '  },',
  '  async scheduled(_event, env) { await appFor(env).schedule(env.DB); },',
  '};',
].join('\n');
await writeFile(new URL('index.mjs', dist), worker + '\n');
