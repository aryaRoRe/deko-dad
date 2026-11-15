import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { makeAnswerer } from './assistant.mjs';
import { createDekoServer } from './server.mjs';
import { freeAnswer } from './core.mjs';

const origin = 'http://127.0.0.1:8787';
const password = 'fixture-team-password';
const channels = {
  instagram: 'https://www.instagram.com/deko_fixture',
  facebook: 'https://www.facebook.com/deko_fixture',
  telegram: 'https://t.me/deko_fixture',
};

async function serve(options) {
  const server = createDekoServer({ origin, teamPassword: password, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async page(path) { return fetch(base + path); },
    async call(path, status, { method = 'GET', body, visitor, cookie, requestOrigin = origin } = {}) {
      const headers = { Origin: requestOrigin };
      if (visitor) headers.Authorization = `Bearer ${visitor}`;
      if (cookie) headers.Cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const result = await response.json();
      assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
      return { ...result, headers: response.headers };
    },
    stop: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

test('human handoff wins over a pending AI reply and settings are protected and durable', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'deko-test-'));
  const dbPath = join(folder, 'deko.sqlite');
  const modelStarted = Promise.withResolvers();
  const modelReply = Promise.withResolvers();
  let server = await serve({ dbPath, answerer: async thread => { modelStarted.resolve(thread); return modelReply.promise; } });

  try {
    await server.call('/api/staff/settings', 401);
    await server.call('/api/staff/login', 403, { method: 'POST', body: { password }, requestOrigin: 'https://example.invalid' });
    const login = await server.call('/api/staff/login', 200, { method: 'POST', body: { password } });
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const settings = await server.call('/api/staff/settings', 200, { cookie });
    const updated = { version: settings.version, links: channels, catalog: [], knowledge: 'Approved fixture.' };
    await server.call('/api/staff/settings', 400, { method: 'PUT', cookie, body: { ...updated, links: { ...channels, telegram: 'https://example.invalid/unknown' } } });
    await server.call('/api/staff/settings', 200, { method: 'PUT', cookie, body: updated });
    await server.call('/api/staff/settings', 409, { method: 'PUT', cookie, body: updated });
    assert.deepEqual((await server.call('/api/public', 200)).links, channels);

    const { credential: visitor, thread } = await server.call('/api/conversations', 201, { method: 'POST', body: { role: 'seller', lang: 'fa' } });
    const text = 'می‌خوام دربارهٔ ثبت فروشگاه سؤال کنم.';
    const requestId = randomUUID();
    const message = server.call('/api/conversation/message', 200, { method: 'POST', visitor, body: { text, requestId } });
    assert.equal((await modelStarted.promise).role, 'seller');
    await server.call(`/api/staff/thread/${thread.id}`, 404, { cookie });
    await server.call('/api/conversation', 401, { visitor: 'A'.repeat(43) });
    assert.equal((await server.call('/api/conversation/support', 200, { method: 'POST', visitor })).status, 'waiting');
    modelReply.resolve({ text: 'This stale model reply should be discarded.', products: [] });
    assert.deepEqual((await message).messages.map(item => item.sender), ['visitor']);
    assert.equal((await server.call('/api/staff/queue', 200, { cookie })).threads[0].id, thread.id);
    await server.call('/api/conversation/message', 200, { method: 'POST', visitor, body: { text, requestId } });
    const reply = { text: 'سلام، تیم دکو اینجاست.', requestId: randomUUID() };
    await server.call(`/api/staff/thread/${thread.id}/reply`, 200, { method: 'POST', cookie, body: reply });
    await server.call(`/api/staff/thread/${thread.id}/reply`, 200, { method: 'POST', cookie, body: reply });
    const joined = await server.call('/api/conversation', 200, { visitor });
    assert.equal(joined.status, 'human');
    assert.deepEqual(joined.messages.map(item => item.text), [text, reply.text]);
    await server.call(`/api/staff/thread/${thread.id}/close`, 200, { method: 'POST', cookie });
    await server.call('/api/conversation/message', 409, { method: 'POST', visitor, body: { text, requestId: randomUUID() } });

    await server.stop();
    server = await serve({ dbPath });
    assert.deepEqual((await server.call('/api/public', 200)).links, channels);
    assert.equal((await server.call('/api/conversation', 200, { visitor })).status, 'closed');
    await server.call('/api/staff/logout', 200, { method: 'POST', cookie });
    await server.call('/api/staff/settings', 401, { cookie });
  } finally {
    modelReply.resolve({ text: 'Fixture.', products: [] });
    await server.stop();
    await rm(folder, { recursive: true, force: true });
  }
});

test('assistant uses approved catalogue records and accepts only available product IDs', async () => {
  const product = { id: 'gift-1', name: 'Tea gift', description: 'Gift for tea lovers', price: 60, currency: 'AUD', countries: ['AU'], url: 'https://example.invalid/gift', inStock: true };
  const answer = makeAnswerer({ apiKey: 'fixture', request: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, 'json_schema');
    const context = JSON.parse(body.input[0].content);
    assert.equal(context.role, 'customer');
    assert.equal(context.language, 'English');
    assert.deepEqual(context.products.map(item => item.id), ['gift-1']);
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ message: 'Here is a gift option.', productIds: ['invented', 'sold-out', 'gift-1', 'gift-1'] }) }] }] });
  } });
  const result = await answer({ role: 'customer', lang: 'en', messages: [{ sender: 'visitor', text: 'A tea gift under AUD 80 for Australia' }] }, {
    knowledge: 'Approved fixture.', catalog: [product, { ...product, id: 'sold-out', inStock: false }],
  });
  assert.deepEqual(result, { text: 'Here is a gift option.', products: [product] });
});

test('the chat, embed script, protected team page and character are served from the normal entry point', async () => {
  const server = await serve({ embedOrigins: ['https://site.example.invalid'] });
  try {
    const directory = await server.page('/chat');
    assert.equal(directory.status, 200);
    assert.match(directory.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/site\.example\.invalid/);
    assert.match(await directory.text(), /id="support"/);
    const teamPage = await server.page('/staff');
    assert.equal(teamPage.status, 200);
    assert.match(teamPage.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await teamPage.text(), /id="team-password"/);
    for (const path of ['/widget.js', '/chat.js', '/staff.js', '/ui.js', '/styles.css', '/deko-dad.webp']) {
      const asset = await server.page(path);
      assert.equal(asset.status, 200, path);
      const content = await asset.arrayBuffer();
      assert.ok(content.byteLength > 0, path);
    }
  } finally { await server.stop(); }
});

test('free answers support customer and seller questions without a model or invented order data', async () => {
  assert.match(freeAnswer('سفارشم کجاست؟', 'fa', 'customer').text, /شمارهٔ سفارش/);
  assert.match(freeAnswer('How do I list a product?', 'en', 'seller').text, /short description/);
  assert.match(freeAnswer('چطور محصولم رو ثبت کنم؟', 'fa', 'seller').text, /موجودی/);
  assert.equal(freeAnswer('زمان ارسال؟', 'fa', 'customer', {
    catalog: [], knowledge: 'زمان ارسال؟ => زمان ارسال در فاکتور مشخص شده.',
  }).text, 'زمان ارسال در فاکتور مشخص شده.');
  const server = await serve({});
  try {
    const config = await server.call('/api/public', 200);
    assert.equal(config.aiConfigured, false);
    const { credential: visitor } = await server.call('/api/conversations', 201, { method: 'POST', body: { role: 'customer', lang: 'fa' } });
    const result = await server.call('/api/conversation/message', 200, {
      method: 'POST', visitor, body: { text: 'دربارهٔ ارسال سؤال دارم', requestId: randomUUID() },
    });
    assert.deepEqual(result.messages.map(msg => msg.sender), ['visitor', 'assistant']);
    assert.match(result.messages[1].text, /مقصد/);
  } finally {
    await server.stop();
  }
});

