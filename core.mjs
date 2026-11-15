import { createTelegramChannel } from './telegram.mjs';

const utf8 = new TextEncoder();
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(value))));

export const channels = ['instagram', 'facebook', 'telegram'];

const channelHosts = {
  instagram: ['instagram.com', 'instagr.am'],
  facebook: ['facebook.com', 'fb.me', 'm.me', 'messenger.com'],
  telegram: ['t.me', 'telegram.me', 'telegram.org'],
};

export class InputError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function check(ok, code) {
  if (!ok) throw new InputError(400, code);
}

function urlFrom(value, field) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new InputError(400, field);
  }
  check(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port, field);
  return parsed;
}

function normalizeLinks(values) {
  check(values && typeof values === 'object', 'links');
  return Object.fromEntries(channels.map(channel => {
    const value = values[channel];
    check(typeof value === 'string' && value.length <= 800, channel);
    const cleaned = value.trim();
    if (!cleaned) return [channel, ''];
    const parsed = urlFrom(cleaned, channel);
    const allowed = channelHosts[channel].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
    check(allowed && parsed.pathname !== '/', channel);
    return [channel, parsed.href];
  }));
}

function normalizeCatalog(rows) {
  check(Array.isArray(rows) && rows.length <= 1000, 'catalog');
  const ids = new Set();
  return rows.map(row => {
    check(row && typeof row === 'object', 'catalog');
    const { id, name, description = '', price, currency, url, countries, inStock } = row;
    check(typeof id === 'string' && /^[\w.-]{1,64}$/.test(id) && !ids.has(id), 'catalog');
    check(typeof name === 'string' && name.trim() && name.length <= 160, 'catalog');
    check(typeof description === 'string' && description.length <= 500, 'catalog');
    check(typeof price === 'number' && Number.isFinite(price) && price >= 0 && price <= 1e9, 'catalog');
    check(typeof currency === 'string' && /^[A-Z]{3}$/.test(currency), 'catalog');
    check(Array.isArray(countries) && countries.length <= 250 && countries.every(c => typeof c === 'string' && /^(?:[A-Z]{2}|\*)$/.test(c)), 'catalog');
    check(typeof inStock === 'boolean' && typeof url === 'string' && url.length <= 800, 'catalog');
    ids.add(id);
    return { id, name: name.trim(), description: description.trim(), price, currency, url: urlFrom(url, 'catalog').href, countries: [...new Set(countries)], inStock };
  });
}

const initialSettings = {
  links: { instagram: '', facebook: '', telegram: '' },
  knowledge: '',
  catalog: [],
};

function makeStore(db) {
  const statement = (sql, ...parameters) => db.prepare(sql).bind(...parameters);
  const first = async (sql, ...parameters) => statement(sql, ...parameters).first();
  const all = async (sql, ...parameters) => (await statement(sql, ...parameters).all()).results;
  const write = async (sql, ...parameters) => (await statement(sql, ...parameters).run()).meta.changes;

  async function settings() {
    const row = await first('SELECT version, data FROM settings WHERE id = 1');
    return row ? { version: row.version, ...JSON.parse(row.data) } : { version: 1, ...initialSettings };
  }

  async function saveSettings(body) {
    const { version, knowledge, catalog, links } = body;
    check(Number.isSafeInteger(version) && typeof knowledge === 'string' && knowledge.length <= 16000, 'settings');
    const validated = { links: normalizeLinks(links), knowledge: knowledge.trim(), catalog: normalizeCatalog(catalog) };
    await write('INSERT OR IGNORE INTO settings VALUES (1, 1, ?)', JSON.stringify(initialSettings));
    const changed = await write('UPDATE settings SET version = version + 1, data = ? WHERE id = 1 AND version = ?', JSON.stringify(validated), version);
    if (!changed) throw new InputError(409, 'settingsConflict');
    return settings();
  }

  const conversation = id => first('SELECT id, role, lang, status, updated FROM conversations WHERE id = ?', id);
  const visitorConversation = async credential => first(
    'SELECT id, role, lang, status, updated FROM conversations WHERE secret = ?', await digest(credential),
  );
  async function snapshot(id) {
    const thread = await conversation(id);
    if (!thread) throw new InputError(404, 'conversation');
    const messages = await all(
      'SELECT id, sender, text, products, created FROM (' +
      'SELECT id, sender, text, products, created FROM messages WHERE conversation = ? ORDER BY id DESC LIMIT 100' +
      ') ORDER BY id', id,
    );
    return { ...thread, messages: messages.map(row => ({ ...row, products: JSON.parse(row.products) })) };
  }

  async function createConversation(role, lang, telegramChat = null) {
    const id = hex(crypto.getRandomValues(new Uint8Array(12)));
    const credential = token();
    const now = Date.now();
    const insert = statement("INSERT INTO conversations VALUES (?, ?, ?, ?, 'assistant', ?)", id, await digest(credential), role, lang, now);
    if (telegramChat) {
      await db.batch([
        insert,
        statement('INSERT INTO telegram_threads (conversation, chat_id) VALUES (?, ?)', id, telegramChat),
        statement('UPDATE telegram_users SET conversation = ? WHERE chat_id = ?', id, telegramChat),
      ]);
    } else await insert.run();
    return { credential: telegramChat ? null : credential, thread: await snapshot(id) };
  }

  function messageStatement(id, sender, text, requestId, products) {
    const states = {
      visitor: "('assistant', 'waiting', 'human')",
      assistant: "('assistant')",
      team: "('waiting', 'human')",
    };
    return statement(
      'INSERT OR IGNORE INTO messages (conversation, sender, text, products, created, request_id) ' +
      'SELECT id, ?, ?, ?, ?, ? FROM conversations WHERE id = ? AND status IN ' + states[sender],
      sender, text, JSON.stringify(products), Date.now(), requestId, id,
    );
  }

  const append = async (id, sender, text, requestId, products = []) =>
    (await messageStatement(id, sender, text, requestId, products).run()).meta.changes > 0;

  const seen = async (id, sender, requestId) => Boolean(await first(
    'SELECT 1 FROM messages WHERE conversation = ? AND sender = ? AND request_id = ?', id, sender, requestId,
  ));

  async function replyAsTeam(id, text, requestId) {
    const [insert] = await db.batch([
      messageStatement(id, 'team', text, requestId, []),
      statement(
        "UPDATE conversations SET status = 'human' WHERE id = ? AND status = 'waiting' " +
        "AND EXISTS (SELECT 1 FROM messages WHERE conversation = ? AND sender = 'team' AND request_id = ?)", id, id, requestId,
      ),
    ]);
    if (!insert.meta.changes && !(await seen(id, 'team', requestId))) throw new InputError(409, 'notWaiting');
  }

  const setLanguage = (id, lang) => write('UPDATE conversations SET lang = ? WHERE id = ?', lang, id);
  const requestSupport = id => write("UPDATE conversations SET status = 'waiting', updated = ? WHERE id = ? AND status = 'assistant'", Date.now(), id);
  const closeConversation = id => write("UPDATE conversations SET status = 'closed', updated = ? WHERE id = ? AND status IN ('waiting', 'human')", Date.now(), id);
  const teamQueue = () => all(
    "SELECT c.id, c.role, c.lang, c.status, c.updated, CASE WHEN t.chat_id IS NULL THEN 'website' ELSE 'telegram' END AS channel " +
    "FROM conversations AS c LEFT JOIN telegram_threads AS t ON c.id = t.conversation WHERE c.status <> 'assistant' " +
    "ORDER BY CASE c.status WHEN 'waiting' THEN 0 WHEN 'human' THEN 1 ELSE 2 END, c.updated DESC LIMIT 100",
  );

  async function teamSession() {
    const now = Date.now();
    const credential = token();
    await db.batch([
      statement('DELETE FROM team_sessions WHERE expires <= ?', now),
      statement('INSERT INTO team_sessions VALUES (?, ?)', await digest(credential), now + 8 * 60 * 60 * 1000),
    ]);
    return credential;
  }

  const hasTeamSession = async credential => Boolean(await first(
    'SELECT 1 FROM team_sessions WHERE secret = ? AND expires > ?', await digest(credential), Date.now(),
  ));
  const endTeamSession = async credential => write('DELETE FROM team_sessions WHERE secret = ?', await digest(credential));
  return { settings, saveSettings, conversation, visitorConversation, createConversation, snapshot, append, seen,
    setLanguage, requestSupport, closeConversation, replyAsTeam, teamQueue, teamSession, hasTeamSession, endTeamSession };
}

const guidance = {
  fa: {
    hello: 'سلام! من دکو دد هستم. می‌تونم برای خرید، ارسال، مرجوعی و شروع فروش راهنمایی‌ات کنم.',
    order: 'برای بررسی وضعیت سفارش، «پشتیبانی مستقیم» رو بزن و شمارهٔ سفارش رو در پیام بعدی بنویس. تیم دکو می‌تونه وضعیت رو بررسی کنه.',
    shipping: 'هزینه و زمان ارسال به کالا و مقصد بستگی داره. اسم کالا و کشور یا شهرت رو بگو تا تیم دکو از راه «پشتیبانی مستقیم» شرایط رو بررسی کنه.',
    returns: 'برای لغو، مرجوعی یا تعویض، «پشتیبانی مستقیم» رو بزن و شمارهٔ سفارش و دلیل درخواست رو بنویس. تیم دکو شرایط همون سفارش رو بررسی می‌کنه.',
    seller: 'برای شروع فروش، «پشتیبانی مستقیم» رو بزن و اسم کسب‌وکار و نوع محصولت رو بنویس. تیم دکو مراحل ثبت فروشنده رو بهت می‌گه.',
    listing: 'برای بررسی ثبت یا ویرایش کالا، اسم محصول، قیمت، موجودی و توضیح کوتاهش رو آماده کن و از «پشتیبانی مستقیم» برای تیم دکو بفرست.',
    rewards: 'برای بررسی امتیاز، تخفیف یا اعتبار حسابت «پشتیبانی مستقیم» رو انتخاب کن تا تیم دکو اطلاعات حسابت رو بررسی کنه.',
    products: 'اسم یا نوع کالایی که می‌خوای رو بنویس. اگر کالای مرتبطی در کاتالوگ ثبت شده باشه، اینجا می‌تونی ببینیش.',
    related: 'این کالاها در کاتالوگ دکو با درخواستت مرتبط‌اند. جزئیات ثبت‌شدهٔ هرکدوم روی کارت کالا هست.',
    human: 'دکمهٔ «پشتیبانی مستقیم» بالای چت رو بزن تا گفت‌وگو به صندوق تیم دکو بره. جواب تیم همین‌جا میاد.',
    fallback: 'می‌تونی دربارهٔ سفارش، ارسال، مرجوعی یا فروشندگی بپرسی. برای سؤال دیگه، «پشتیبانی مستقیم» رو بزن تا تیم دکو کمکت کنه.',
  },
  en: {
    hello: 'Hi, I’m Deko Dad. Ask me about shopping, shipping, returns, or selling with DEKO.',
    order: 'Choose Direct support and share your order number. The DEKO team can look up your order status.',
    shipping: 'Delivery cost and timing depend on the item and destination. Send the item name and your city or country through Direct support so the team can check.',
    returns: 'For a return, exchange, or cancellation, choose Direct support and send your order number and reason. The team can check the options for your order.',
    seller: 'Choose Direct support and tell the DEKO team your business name and what you sell. They can explain how to register as a seller.',
    listing: 'Send the item name, price, available quantity, and a short description to Direct support. The team can help you with the listing.',
    rewards: 'Choose Direct support to ask the team to review your account’s points, store credit, or discounts.',
    products: 'Type the name or type of item you’re looking for to check the DEKO catalogue.',
    related: 'Here are related items recorded in the DEKO catalogue. Check each product card for its listed details.',
    human: 'Choose Direct support at the top of the chat to send this conversation to the DEKO team. Their reply will appear here.',
    fallback: 'Ask me about orders, shipping, returns, or selling. For another question, choose Direct support to reach the DEKO team.',
  },
};

const topics = [
  ['human', /(?:پشتیبان|اپراتور|کارشناس|گفتگو با تیم|\b(?:support|human|agent)\b)/u],
  ['returns', /(?:مرجوع|بازگشت|تعویض|لغو|بازپرداخت|\b(?:returns?|refunds?|exchange|cancel)\b)/u],
  ['order', /(?:پیگیری|وضعیت سفارش|سفارشم|سفارش کجا|فاکتور|\b(?:tracking|track|order status|where is my order|invoice)\b)/u],
  ['rewards', /(?:تخفیف|امتیاز|کیف پول|اعتبار خرید|\b(?:discount|coupon|points|credit|wallet)\b)/u],
  ['listing', /(?:ثبت کالا|ثبت محصول|محصولم رو ثبت|لیست کردن کالا|معرفی محصول|\b(?:list an item|list a product|listing|add a product)\b)/u],
  ['seller', /(?:فروشنده|فروشندگی|شروع فروش|همکاری|ثبت فروشگاه|\b(?:seller|merchants?|start selling|sell on|partner)\b)/u],
  ['shipping', /(?:ارسال|پست|تحویل|\b(?:shipping|postage|delivery|ship)\b)/u],
  ['products', /(?:محصول|کالا|کاتالوگ|قیمت|موجودی|\b(?:products?|catalogue|catalog|items?|price|stock)\b)/u],
  ['hello', /^(?:سلام|درود|hello|hey|hi)[!.؟\s]*$/u],
];
const normalize = text => text.toLowerCase().normalize('NFKC').replaceAll('ي', 'ی').replaceAll('ك', 'ک').replace(/\u200c/g, ' ');
const productWords = text => normalize(text).match(/[\p{L}\p{N}]{2,}/gu) ?? [];
const commonWords = new Set(['کالا', 'محصول', 'قیمت', 'موجود', 'دارین', 'دارید', 'برای', 'میخوام', 'product', 'item', 'looking', 'price', 'have', 'want', 'for', 'the']);

export function freeAnswer(text, lang, role, settings = initialSettings) {
  const normalized = normalize(text);
  const answers = guidance[lang] ?? guidance.fa;
  const topic = topics.find(([, pattern]) => pattern.test(normalized))?.[0];
  const knowledge = settings.knowledge ?? '';
  for (const line of knowledge.split('\n')) {
    const divider = line.indexOf('=>');
    if (divider < 0) continue;
    if (normalize(line.slice(0, divider).trim()) === normalized.trim()) {
      const approved = line.slice(divider + 2).trim();
      if (approved) return { text: approved.slice(0, 2000), products: [] };
    }
  }
  if (topic && topic !== 'products') return { text: answers[topic], products: [] };
  if (role === 'customer') {
    const search = new Set(productWords(text).filter(word => !commonWords.has(word)));
    const products = settings.catalog.filter(product => product.inStock &&
      productWords(product.name).some(word => search.has(word))).slice(0, 3);
    if (products.length) return { text: answers.related, products };
  }
  return { text: answers[topic ?? 'fallback'], products: [] };
}

const roles = new Set(['customer', 'seller']);
const languages = new Set(['fa', 'en']);
const credentialPattern = /^[A-Za-z0-9_-]{43}$/;
const requestIdPattern = /^[A-Za-z0-9_-]{16,64}$/;
const teamCookie = 'deko_team_session';

function originOf(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value.replace(/\/$/, '')) {
    throw new Error('Use an exact HTTP or HTTPS origin.');
  }
  return url.origin;
}

async function readJSON(request, maxBytes = 10000) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new InputError(415, 'json');
  }
  if (!request.body || Number(request.headers.get('content-length')) > maxBytes) throw new InputError(413, 'tooLarge');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new InputError(413, 'tooLarge');
    }
    text += decoder.decode(value, { stream: true });
  }
  let body;
  try { body = JSON.parse(text + decoder.decode()); }
  catch { throw new InputError(400, 'json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError(400, 'json');
  return body;
}

function readMessage({ text, requestId }) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000 || typeof requestId !== 'string' || !requestIdPattern.test(requestId)) {
    throw new InputError(400, 'message');
  }
  return { text: text.trim(), requestId };
}

function cookieFrom(request) {
  const prefix = teamCookie + '=';
  const raw = (request.headers.get('cookie') ?? '').split(';').map(pair => pair.trim()).find(pair => pair.startsWith(prefix));
  return raw?.slice(prefix.length) ?? '';
}

function makeLimiter() {
  const buckets = new Map();
  let pruneAt = 0;
  return function limit(key, count, duration) {
    const now = Date.now();
    if (now >= pruneAt) {
      for (const [entry, bucket] of buckets) if (bucket.expires <= now) buckets.delete(entry);
      pruneAt = now + 60000;
    }
    let bucket = buckets.get(key);
    if (!bucket || bucket.expires <= now) {
      bucket = { count: 0, expires: now + duration };
      buckets.set(key, bucket);
    }
    if (bucket.count >= count) throw new InputError(429, 'rateLimit');
    bucket.count++;
  };
}

export const assetFiles = {
  '/': ['chat.html', 'text/html'],
  '/chat': ['chat.html', 'text/html'],
  '/staff': ['staff.html', 'text/html'],
  '/chat.js': ['chat.js', 'text/javascript'],
  '/staff.js': ['staff.js', 'text/javascript'],
  '/ui.js': ['ui.js', 'text/javascript'],
  '/widget.js': ['widget.js', 'text/javascript'],
  '/styles.css': ['styles.css', 'text/css'],
  '/deko-dad.webp': ['deko-dad.webp', 'image/webp'],
};

export function createDekoApp({
  loadAsset, origin, embedOrigins = [], telegramOptions,
  verifyTeamPassword = null, answerer = null, log = console,
}) {
  const trustedOrigin = origin ? originOf(origin) : null;
  const frameAncestors = ["'self'", ...new Set(embedOrigins.map(originOf))].join(' ');
  const limit = makeLimiter();
  const pending = new Set();
  const telegram = createTelegramChannel({ ...telegramOptions, answer: freeAnswer, log });

  async function authorizeVisitor(request, store) {
    const authorization = request.headers.get('authorization') ?? '';
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const thread = credentialPattern.test(bearer) && await store.visitorConversation(bearer);
    if (!thread) throw new InputError(401, 'visitorSession');
    return thread;
  }

  async function authorizeTeam(request, store) {
    const credential = cookieFrom(request);
    if (!credentialPattern.test(credential) || !(await store.hasTeamSession(credential))) {
      throw new InputError(401, 'staffSession');
    }
    return credential;
  }

  async function visitorMessage(request, store) {
    const visitor = await authorizeVisitor(request, store);
    const body = await readJSON(request);
    const { text, requestId } = readMessage(body);
    if (await store.seen(visitor.id, 'visitor', requestId)) return store.snapshot(visitor.id);
    const current = await store.conversation(visitor.id);
    if (current.status === 'closed') throw new InputError(409, 'closed');
    const assistantTurn = current.status === 'assistant';
    if (assistantTurn && (pending.has(current.id) || (answerer && pending.size >= 12))) throw new InputError(409, 'busy');
    limit('conversation:' + current.id, 25, 60000);
    if (assistantTurn && answerer) limit('model', 120, 60000);
    const lang = languages.has(body.lang) ? body.lang : current.lang;
    if (assistantTurn) pending.add(current.id);
    try {
      if (lang !== current.lang) await store.setLanguage(current.id, lang);
      if (!(await store.append(current.id, 'visitor', text, requestId))) {
        if (await store.seen(current.id, 'visitor', requestId)) return store.snapshot(current.id);
        throw new InputError(409, 'closed');
      }
      if (assistantTurn && (await store.conversation(current.id)).status === 'assistant') {
        const settings = await store.settings();
        let reply;
        if (answerer) {
          try { reply = await answerer(await store.snapshot(current.id), settings); }
          catch (error) { log.warn('DEKO AI provider error.', error.name); }
        }
        reply ??= freeAnswer(text, lang, current.role, settings);
        await store.append(current.id, 'assistant', reply.text, requestId, reply.products);
      }
      return store.snapshot(current.id);
    } finally {
      if (assistantTurn) pending.delete(current.id);
    }
  }

  async function handle(request, db, clientKey = 'local', defer = task => void task) {
    const url = new URL(request.url);
    const { pathname: path } = url;
    const publicOrigin = trustedOrigin ?? url.origin;
    const method = request.method;
    const headers = new Headers({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors " +
        (['/', '/chat'].includes(path) ? frameAncestors : "'none'"),
    });
    const json = (status, value) => {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(value), { status, headers });
    };
    const cookieFlags = 'Path=/api/staff; HttpOnly; SameSite=Strict' + (publicOrigin.startsWith('https:') ? '; Secure' : '');
    try {
      const asset = Object.hasOwn(assetFiles, path) ? assetFiles[path] : null;
      if ((method === 'GET' || method === 'HEAD') && asset) {
        const [file, type] = asset;
        headers.set('Content-Type', type.startsWith('image/') ? type : type + '; charset=utf-8');
        return new Response(method === 'HEAD' ? null : await loadAsset(file), { headers });
      }
      const store = makeStore(db);
      if (method === 'GET' && path === '/healthz') {
        await store.settings();
        return json(200, { ok: true, telegramConfigured: Boolean(telegram) });
      }
      if (method === 'POST' && path === '/webhooks/telegram') {
        if (!telegram) throw new InputError(404, 'notFound');
        if (!telegram.authorize(request.headers.get('x-telegram-bot-api-secret-token'))) throw new InputError(403, 'webhook');
        const handled = await telegram.accept(await readJSON(request, 65536), db, store);
        if (!handled) return json(503, { ok: false });
        defer(telegram.flush(db).catch(error => log.warn('DEKO Telegram queue error.', error.name)));
        return json(200, { ok: true });
      }
      if (method !== 'GET' && request.headers.get('origin') !== publicOrigin) throw new InputError(403, 'origin');
      if (method === 'GET' && path === '/api/public') {
        return json(200, { links: (await store.settings()).links, aiConfigured: Boolean(answerer), staffConfigured: Boolean(verifyTeamPassword) });
      }
      if (method === 'POST' && path === '/api/conversations') {
        limit('new:' + clientKey, 25, 60000);
        const { role, lang } = await readJSON(request);
        if (!roles.has(role) || !languages.has(lang)) throw new InputError(400, 'role');
        return json(201, await store.createConversation(role, lang));
      }

      if (method === 'GET' && path === '/api/conversation') {
        return json(200, await store.snapshot((await authorizeVisitor(request, store)).id));
      }
      if (method === 'POST' && path === '/api/conversation/message') return json(200, await visitorMessage(request, store));
      if (method === 'POST' && path === '/api/conversation/support') {
        const thread = await authorizeVisitor(request, store);
        if (thread.status === 'closed') throw new InputError(409, 'closed');
        await store.requestSupport(thread.id);
        return json(200, await store.snapshot(thread.id));
      }

      if (method === 'POST' && path === '/api/staff/login') {
        if (!verifyTeamPassword) throw new InputError(503, 'staffDisabled');
        limit('login:' + clientKey, 12, 900000);
        const { password } = await readJSON(request);
        if (typeof password !== 'string' || !(await verifyTeamPassword(password))) throw new InputError(401, 'password');
        headers.set('Set-Cookie', teamCookie + '=' + await store.teamSession() + '; ' + cookieFlags + '; Max-Age=28800');
        return json(200, { ok: true });
      }
      if (path.startsWith('/api/staff/')) {
        const credential = await authorizeTeam(request, store);
        if (method === 'POST' && path === '/api/staff/logout') {
          await store.endTeamSession(credential);
          headers.set('Set-Cookie', teamCookie + '=; ' + cookieFlags + '; Max-Age=0');
          return json(200, { ok: true });
        }
        if (method === 'GET' && path === '/api/staff/settings') return json(200, await store.settings());
        if (method === 'PUT' && path === '/api/staff/settings') {
          return json(200, await store.saveSettings(await readJSON(request, 1500000)));
        }
        if (method === 'GET' && path === '/api/staff/queue') return json(200, { threads: await store.teamQueue() });

        const match = /^\/api\/staff\/thread\/([a-f0-9]{24})(?:\/(reply|close))?$/.exec(path);
        if (match) {
          const [, id, action] = match;
          const thread = await store.conversation(id);
          if (!thread || thread.status === 'assistant') throw new InputError(404, 'conversation');
          if (method === 'GET' && !action) return json(200, await store.snapshot(id));
          if (method === 'POST' && action === 'reply') {
            const { text, requestId } = readMessage(await readJSON(request));
            await store.replyAsTeam(id, text, requestId);
            if (telegram) defer(telegram.flush(db).catch(error => log.warn('DEKO Telegram queue error.', error.name)));
            return json(200, await store.snapshot(id));
          }
          if (method === 'POST' && action === 'close') {
            await store.closeConversation(id);
            return json(200, await store.snapshot(id));
          }
        }
      }
      throw new InputError(404, 'notFound');
    } catch (error) {
      if (error instanceof InputError) return json(error.status, { error: error.code });
      log.error('DEKO server request failed.', error.code ?? error.name);
      return json(500, { error: 'server' });
    }
  }
  handle.schedule = db => telegram?.scheduled(db);
  return handle;
}
