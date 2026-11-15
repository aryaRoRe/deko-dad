import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { makeAnswerer } from './assistant.mjs';
import { createDekoApp } from './core.mjs';
import { openDatabase } from './store.mjs';

const hash = text => createHash('sha256').update(text).digest();
const loadAsset = file => readFile(new URL('./public/' + file, import.meta.url));

export function createDekoServer({
  origin, embedOrigins = [], dbPath = ':memory:', teamPassword = '', answerer = null,
  log = console, telegramOptions,
} = {}) {
  if (teamPassword && teamPassword.length < 16) throw new Error('DEKO_TEAM_PASSWORD must contain at least 16 characters.');
  const expectedPassword = teamPassword ? hash(teamPassword) : null;
  const db = openDatabase(dbPath);
  const app = createDekoApp({
    loadAsset, origin, embedOrigins, answerer, telegramOptions, log,
    verifyTeamPassword: expectedPassword ? password => timingSafeEqual(hash(password), expectedPassword) : null,
  });
  const server = createServer({ requestTimeout: 55000, headersTimeout: 10000 }, async (req, res) => {
    try {
      const headers = new Headers(req.headers);
      const raw = new URL(req.url, origin);
      const body = ['GET', 'HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' };
      const request = new Request(raw, { method: req.method, headers, ...body });
      const result = await app(request, db, req.socket.remoteAddress);
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(result.body ? Buffer.from(await result.arrayBuffer()) : undefined);
    } catch (error) {
      log.error('DEKO HTTP request failed.', error.code ?? error.name);
      if (res.headersSent) return res.destroy();
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"error":"server"}');
    }
  });
  if (telegramOptions?.botToken && telegramOptions?.webhookSecret) {
    const timer = setInterval(() => {
      Promise.resolve(app.schedule(db)).catch(error => log.warn('DEKO Telegram retry error.', error.name));
    }, 60000);
    timer.unref();
    server.once('close', () => clearInterval(timer));
  }
  server.once('close', db.close);
  return server;
}

if (import.meta.main) {
  const port = Number(process.env.DEKO_PORT ?? '8787');
  const host = process.env.DEKO_HOST || '127.0.0.1';
  const origin = process.env.DEKO_PUBLIC_ORIGIN || 'http://127.0.0.1:' + port;
  const server = createDekoServer({
    origin,
    embedOrigins: (process.env.DEKO_EMBED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean),
    dbPath: process.env.DEKO_DB_PATH || './data/deko.sqlite',
    teamPassword: process.env.DEKO_TEAM_PASSWORD ?? '',
    telegramOptions: { botToken: process.env.TELEGRAM_BOT_TOKEN, webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET },
    answerer: makeAnswerer({ apiKey: process.env.OPENAI_API_KEY, model: process.env.DEKO_OPENAI_MODEL || undefined }),
  });
  server.listen(port, host, () => console.log('Deko Dad listening on ' + origin));
}
