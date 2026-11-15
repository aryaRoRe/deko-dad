import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDekoApp } from './core.mjs';
import { openDatabase } from './store.mjs';

const origin = 'https://deko.example';
const password = 'fixture-inbox-password';
const webhookSecret = 'fixture-webhook-secret-for-test-only';
const botToken = '1234567:fixture-identifier-only-hi';

function fixture(opts = {}) {
  const db = openDatabase(':memory:');
  const deliveries = [];
  const app = createDekoApp({
    origin, verifyTeamPassword: value => value === password,
    telegramOptions: {
      botToken, webhookSecret,
      request: async (url, options) => {
        assert.ok(url.endsWith('/sendMessage'));
        const payload = JSON.parse(options.body);
        if (opts.failDeliveries?.()) return Response.json({ ok: false, error_code: 429, parameters: { retry_after: 30 } }, { status: 429 });
        deliveries.push(payload);
        return Response.json({ ok: true, result: { message_id: deliveries.length } });
      },
    },
  });
  async function call(path, status, { method = 'GET', body, secret, cookie } = {}) {
    const headers = new Headers({ Origin: origin });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (secret) headers.set('X-Telegram-Bot-Api-Secret-Token', secret);
    if (cookie) headers.set('Cookie', cookie);
    const pending = [];
    const response = await app(new Request(origin + path, { method, headers, body: body === undefined ? null : JSON.stringify(body) }),
      db, 'fixture-address', task => pending.push(task));
    await Promise.all(pending);
    const json = await response.json();
    assert.equal(response.status, status, JSON.stringify(json));
    return { json, headers: response.headers };
  }
  function update(updateId, text, { chatId = 710001, lang = 'fa', chatType = 'private', secret = webhookSecret, status = 200 } = {}) {
    return call('/webhooks/telegram', status, {
      method: 'POST', secret,
      body: { update_id: updateId, message: { text, chat: { id: chatId, type: chatType }, from: { id: chatId, language_code: lang } } },
    });
  }
  return { db, app, deliveries, call, update };
}

test('authenticated Telegram webhook, commands, ticket queue and staff replies use the actual core', async () => {
  const { db, call, update, deliveries } = fixture();
  try {
    assert.equal((await call('/healthz', 200)).json.telegramConfigured, true);
    await update(1, '/start', { secret: 'wrong-secret', status: 403 });
    await update(1, '/start', { chatType: 'group' });
    assert.equal(deliveries.length, 0);

    await update(1, '/start');
    await update(1, '/start');
    assert.equal(deliveries.length, 1);
    assert.match(deliveries.at(-1).text, /Deko Dad/);
    await update(2, '/seller');
    assert.match(deliveries.at(-1).text, /فروشنده/);
    await update(3, 'چطور محصولم رو ثبت کنم؟');
    assert.match(deliveries.at(-1).text, /موجودی/);
    await update(4, '/support');
    const reference = deliveries.at(-1).text.match(/DEKO-[A-F0-9]{8}/)[0];
    await update(5, 'سؤال برای تیم');
    await update(5, 'سؤال برای تیم');
    assert.match(deliveries.at(-1).text, /اضافه شد/);
    await update(6, '/status', { chatId: 710002, lang: 'en' });
    assert.match(deliveries.at(-1).text, /Choose \/support/);
    assert.doesNotMatch(deliveries.at(-1).text, /DEKO-[A-F0-9]{8}/);

    assert.equal((await call('/api/staff/queue', 401)).json.error, 'staffSession');
    const login = await call('/api/staff/login', 200, { method: 'POST', body: { password } });
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const { threads } = (await call('/api/staff/queue', 200, { cookie })).json;
    assert.equal(threads.length, 1);
    assert.equal(threads[0].role, 'seller');
    assert.equal(threads[0].channel, 'telegram');
    const url = '/api/staff/thread/' + threads[0].id;
    const thread = (await call(url, 200, { cookie })).json;
    assert.equal(thread.messages.filter(x => x.text === 'سؤال برای تیم').length, 1);
    const reply = { text: 'تیم دکو اینجا است.', requestId: randomUUID() };
    const before = deliveries.length;
    await call(url + '/reply', 200, { method: 'POST', cookie, body: reply });
    await call(url + '/reply', 200, { method: 'POST', cookie, body: reply });
    assert.equal(deliveries.length, before + 1);
    assert.equal(deliveries.at(-1).chat_id, '710001');
    assert.equal(deliveries.at(-1).text, reference + '\n' + reply.text);
    await call(url + '/close', 200, { method: 'POST', cookie });
    await update(7, '/status');
    assert.match(deliveries.at(-1).text, /بسته شده/);
  } finally {
    db.close();
  }
});

test('a rate-limited reply stays in the queue and is retried without duplicating the update', async () => {
  let throttled = true;
  const { db, app, update, deliveries } = fixture({ failDeliveries: () => throttled });
  try {
    await update(19, '/start', { lang: 'en' });
    assert.equal(deliveries.length, 0);
    const lookup = db.prepare('SELECT attempts, sent_at, available_at FROM telegram_outbox WHERE delivery_key = ?').bind('update:19');
    const queued = await lookup.first();
    assert.equal(queued.attempts, 1);
    assert.equal(queued.sent_at, null);
    assert.ok(queued.available_at > Date.now());
    await db.prepare('UPDATE telegram_outbox SET available_at = 0 WHERE delivery_key = ?').bind('update:19').run();
    throttled = false;
    await app.schedule(db);
    await update(19, '/start', { lang: 'en' });
    assert.equal(deliveries.length, 1);
    assert.ok((await lookup.first()).sent_at);
  } finally {
    db.close();
  }
});
