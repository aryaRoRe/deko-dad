const tokenPattern = /^\d+:[A-Za-z0-9_-]{20,100}$/;
const secretPattern = /^[A-Za-z0-9_-]{32,256}$/;
const withBody = (method, body) => ({
  method, signal: AbortSignal.timeout(6000),
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export function sameSecret(value, expected) {
  if (typeof value !== 'string' || value.length !== expected.length) return false;
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return different === 0;
}

const words = {
  fa: {
    menu: 'سلام! من Deko Dad، دستیار دکو هستم. پیام بنویس یا یکی از این دستورها رو بزن.\n/customer مشتری · /seller فروشنده\n/support پشتیبانی · /status پیگیری\n/new گفت‌وگوی تازه · /en English',
    customer: 'مسیر مشتری فعاله. می‌تونی دربارهٔ سفارش، ارسال یا مرجوعی بپرسی.',
    seller: 'مسیر فروشنده فعاله. می‌تونی دربارهٔ شروع فروش یا ثبت محصول بپرسی.',
    active: 'هنوز یک درخواست پشتیبانی باز داری. پیامت رو توی همین گفتگو بفرست یا /status رو بزن.',
    noTicket: 'برای ثبت درخواست به تیم دکو /support رو بزن.',
    waiting: 'درخواستت به صندوق پشتیبانی دکو رسید. جزئیات سوالت رو همین‌جا بنویس. شمارهٔ پیگیری',
    human: 'تیم دکو از اینجا پاسخ می‌ده. شمارهٔ پیگیری',
    received: 'پیامت به گفت‌وگوی پشتیبانی اضافه شد. شمارهٔ پیگیری',
    closed: 'این گفت‌وگو بسته شده. برای شروع دوباره /new رو بزن. شمارهٔ پیگیری',
    fresh: 'گفت‌وگوی تازه آماده است. پیامت رو بنویس.',
    command: 'برای دیدن دستورهای دکو /help رو بزن.',
    tooLong: 'لطفاً پیامت رو در کمتر از ۲۰۰۰ نویسه بفرست.',
  },
  en: {
    menu: 'Hi, I’m Deko Dad. Type a question or choose a command.\n/customer Customer · /seller Seller\n/support Contact support · /status Track request\n/new New chat · /fa فارسی',
    customer: 'Customer mode is ready. Ask about orders, shipping or returns.',
    seller: 'Seller mode is ready. Ask about starting a store or listing an item.',
    active: 'Your support request is still open. Reply here or choose /status.',
    noTicket: 'Choose /support to contact the DEKO team.',
    waiting: 'Your request is in the support inbox. Add the details here. Reference',
    human: 'The DEKO team will reply here. Reference',
    received: 'Your message was added to the support conversation. Reference',
    closed: 'This conversation is closed. Use /new to start again. Reference',
    fresh: 'A new conversation is ready. Send your question.',
    command: 'Use /help to see the DEKO commands.',
    tooLong: 'Please send a message under 2,000 characters.',
  },
};

const ticket = (label, thread) => label + ' DEKO-' + thread.id.slice(-8).toUpperCase();
const roleCommands = new Map([['/customer', 'customer'], ['/seller', 'seller']]);

function database(db) {
  const sql = (text, ...values) => db.prepare(text).bind(...values);
  return {
    sql,
    first: (text, ...values) => sql(text, ...values).first(),
    all: async (text, ...values) => (await sql(text, ...values).all()).results,
    change: async (text, ...values) => (await sql(text, ...values).run()).meta.changes,
  };
}

export function createTelegramChannel({ botToken, webhookSecret, answer, request = fetch, log = console } = {}) {
  if (!botToken || !webhookSecret) return null;
  if (!tokenPattern.test(botToken ?? '') || !secretPattern.test(webhookSecret ?? '')) {
    throw new Error('Configure a valid TELEGRAM_BOT_TOKEN and a 32+ character TELEGRAM_WEBHOOK_SECRET.');
  }

  async function flush(db) {
    const data = database(db);
    const now = Date.now();
    const pending = await data.all(
      'SELECT id, chat_id, text, attempts FROM telegram_outbox WHERE sent_at IS NULL AND failed_at IS NULL AND available_at <= ? ORDER BY available_at, id LIMIT 4',
      now,
    );
    for (const row of pending) {
      const claim = crypto.randomUUID();
      const changed = await data.change(
        'UPDATE telegram_outbox SET claim = ?, available_at = ? WHERE id = ? AND available_at <= ? AND sent_at IS NULL AND failed_at IS NULL',
        claim, Date.now() + 20000, row.id, Date.now(),
      );
      if (!changed) continue;

      let delivered = false;
      let permanent = false;
      let waitSeconds = Math.min(3600, 2 ** (row.attempts + 1) * 10);
      try {
        const response = await request('https://api.telegram.org/bot' + botToken + '/sendMessage', withBody('POST', {
          chat_id: row.chat_id, text: row.text, link_preview_options: { is_disabled: true },
        }));
        const result = await response.json();
        delivered = response.ok && result.ok === true;
        permanent = [400, 403].includes(result.error_code);
        if (Number.isFinite(result.parameters?.retry_after)) waitSeconds = Math.max(waitSeconds, result.parameters.retry_after);
      } catch {
        log.warn('DEKO Telegram delivery will retry.');
      }

      const attempts = row.attempts + 1;
      await data.change(
        'UPDATE telegram_outbox SET claim = NULL, sent_at = ?, failed_at = ?, attempts = ?, available_at = ? WHERE id = ? AND claim = ?',
        delivered ? Date.now() : null, !delivered && (permanent || attempts >= 10) ? Date.now() : null,
        attempts, Date.now() + waitSeconds * 1000, row.id, claim,
      );
    }
  }

  async function responseText(message, updateId, db, store) {
    const data = database(db);
    const chat = String(message.chat.id);
    const lang = String(message.from.language_code ?? '').startsWith('en') ? 'en' : 'fa';
    await data.change('INSERT OR IGNORE INTO telegram_users (chat_id, lang) VALUES (?, ?)', chat, lang);
    const user = await data.first('SELECT role, lang, conversation FROM telegram_users WHERE chat_id = ?', chat);
    const phrase = words[user.lang];
    const text = message.text.trim();
    if (!text || text.length > 2000) return phrase.tooLong;
    const command = text.startsWith('/') ? text.split(/\s+/, 1)[0].split('@', 1)[0].toLowerCase() : '';
    const thread = user.conversation ? await store.conversation(user.conversation) : null;
    const active = thread && ['waiting', 'human'].includes(thread.status);

    if (['/start', '/help', '/menu'].includes(command)) return phrase.menu;
    if (command === '/fa' || command === '/en') {
      const selected = command.slice(1);
      await data.change('UPDATE telegram_users SET lang = ? WHERE chat_id = ?', selected, chat);
      return words[selected].menu;
    }
    if (command === '/new' || roleCommands.has(command)) {
      if (active) return ticket(phrase.active, thread);
      const role = roleCommands.get(command) ?? user.role;
      if (role !== user.role || command === '/new') {
        await data.change('UPDATE telegram_users SET role = ?, conversation = NULL WHERE chat_id = ?', role, chat);
      }
      return command === '/new' ? phrase.fresh : phrase[role];
    }
    if (command === '/status') {
      return thread && thread.status !== 'assistant' ? ticket(phrase[thread.status], thread) : phrase.noTicket;
    }
    if (command && command !== '/support') return phrase.command;
    if (thread?.status === 'closed') return ticket(phrase.closed, thread);

    const conversation = thread ?? (await store.createConversation(user.role, user.lang, chat)).thread;
    if (command === '/support') {
      await store.requestSupport(conversation.id);
      const state = await store.conversation(conversation.id);
      return ticket(phrase[state.status], state);
    }
    const requestId = 'telegram:' + updateId;
    await store.append(conversation.id, 'visitor', text, requestId);
    const current = await store.conversation(conversation.id);
    if (current.status === 'closed') return ticket(phrase.closed, current);
    if (current.status !== 'assistant') return ticket(phrase.received, current);

    const previous = await data.first(
      "SELECT text FROM messages WHERE conversation = ? AND sender = 'assistant' AND request_id = ?", current.id, requestId,
    );
    if (previous) return previous.text;
    const result = answer(text, user.lang, user.role, await store.settings());
    const cards = result.products.map(product => product.name + ' · ' + product.currency + ' ' + product.price + '\n' + product.url);
    const reply = [result.text, ...cards].join('\n\n').slice(0, 4000);
    const written = await store.append(current.id, 'assistant', reply, requestId);
    if (!written) return ticket(phrase.received, current);
    return reply;
  }

  async function accept(update, db, store) {
    const message = update.message;
    if (!message || message.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) ||
        message.chat.id <= 0 || message.from?.id !== message.chat.id || typeof message.text !== 'string' ||
        !Number.isSafeInteger(update.update_id) || update.update_id < 0) return true;

    const id = String(update.update_id);
    const data = database(db);
    const now = Date.now();
    const claim = crypto.randomUUID();
    const changed = await data.change(
      'INSERT INTO telegram_updates (update_id, claim, retry_at, handled_at) VALUES (?, ?, ?, NULL) ' +
      'ON CONFLICT(update_id) DO UPDATE SET claim = excluded.claim, retry_at = excluded.retry_at ' +
      'WHERE handled_at IS NULL AND retry_at <= ?', id, claim, now + 20000, now,
    );
    if (!changed) {
      const existing = await data.first('SELECT handled_at FROM telegram_updates WHERE update_id = ?', id);
      return Boolean(existing?.handled_at);
    }
    try {
      const text = await responseText(message, id, db, store);
      const done = Date.now();
      const [, recorded] = await db.batch([
        data.sql(
          'INSERT OR IGNORE INTO telegram_outbox (delivery_key, chat_id, text, available_at) ' +
          'SELECT ?, ?, ?, ? FROM telegram_updates WHERE update_id = ? AND claim = ?', 'update:' + id,
          String(message.chat.id), text, done, id, claim,
        ),
        data.sql('UPDATE telegram_updates SET handled_at = ?, claim = NULL WHERE update_id = ? AND claim = ?', done, id, claim),
      ]);
      return recorded.meta.changes > 0;
    } catch (error) {
      await data.change('UPDATE telegram_updates SET claim = NULL, retry_at = 0 WHERE update_id = ? AND claim = ?', id, claim);
      throw error;
    }
  }

  return {
    authorize: value => sameSecret(value, webhookSecret),
    accept,
    flush,
    async scheduled(db) {
      await flush(db);
      const before = Date.now() - 7 * 86400000;
      const data = database(db);
      await data.change('DELETE FROM telegram_updates WHERE handled_at < ?', before);
      await data.change('DELETE FROM telegram_outbox WHERE sent_at < ? OR failed_at < ?', before, before);
    },
  };
}
