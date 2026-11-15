const labels = {
  fa: {
    close: 'بستن', mascot: 'Deko Dad، ربات مشکی و طلایی', tagline: 'دستیار بازار دکو و همسر Deko Mom',
    askDeko: 'از دکو بپرس', assistantLabel: 'دستیار بازار دکو', support: 'پشتیبانی مستقیم', chooseRole: 'نوع گفت‌وگو',
    customerChoice: 'مشتری‌ام', sellerChoice: 'فروشنده‌ام', newChat: 'گفت‌وگوی تازه', chatMessages: 'پیام‌های گفت‌وگو',
    message: 'پیام', messagePlaceholder: 'پیامت رو بنویس…', send: 'ارسال', official: 'دکو در شبکه‌های اجتماعی',
    supportTitle: 'گفت‌وگو با تیم دکو', handoffNote: 'تیم دکو پیام‌های همین گفت‌وگو رو می‌بینه. جوابشون همین‌جا نمایش داده می‌شه.',
    requestSupport: 'ارسال به پشتیبانی', cancel: 'انصراف', greetingCustomer: 'سلام! من Deko Dad هستم. دنبال چه محصول یا خدماتی می‌گردی؟ اگر بودجه یا مقصد ارسال مشخصه، همون اول بگو.',
    greetingSeller: 'سلام! من Deko Dad هستم. دربارهٔ شروع فروش، معرفی محصول یا همکاری با دکو چه کمکی ازم برمیاد؟',
    shipping: 'دربارهٔ ارسال سؤال دارم', join: 'چطور فروشنده بشم؟', listing: 'چطور محصولم رو ثبت کنم؟',
    order: 'پیگیری سفارش', returns: 'مرجوعی و تعویض',
    aiNotice: 'پیام‌های این بخش برای تولید پاسخ به OpenAI فرستاده می‌شن.', freeGuide: 'پاسخ‌گوی خودکار',
    waiting: 'در صف پشتیبانی', human: 'در گفت‌وگو با تیم دکو', closed: 'گفت‌وگو بسته شد',
    waitingNote: 'درخواستت به صندوق تیم دکو رسید. پیام تازه‌ات رو می‌تونی همین‌جا بنویسی.',
    humanNote: 'از اینجا به بعد تیم دکو در همین چت جواب می‌ده.', closedNote: 'تیم دکو این گفت‌وگو رو بست. برای سؤال دیگه «گفت‌وگوی تازه» رو بزن.',
    writing: 'Deko Dad در حال آماده کردن پاسخ است…', visitor: 'شما', assistant: 'Deko Dad', team: 'تیم دکو',
    instagram: 'اینستاگرام', facebook: 'فیسبوک', telegram: 'تلگرام', website: 'وب‌سایت', ticket: 'شمارهٔ پیگیری', viewProduct: 'دیدن محصول', worldwide: 'ارسال جهانی',
    staffTitle: 'پنل تیم دکو', backToChat: 'برگشت به چت', signIn: 'ورود تیم دکو', passwordLabel: 'رمز تیم', signOut: 'خروج', inbox: 'پشتیبانی', settingsTab: 'تنظیمات دستیار',
    supportQueue: 'صندوق پشتیبانی', emptyQueue: 'هنوز درخواستی وارد صندوق نشده.', selectThread: 'یک گفت‌وگو رو از صندوق انتخاب کن.',
    customer: 'مشتری', seller: 'فروشنده', readThread: 'گفت‌وگوی پشتیبانی', writeReply: 'پاسخ تیم رو بنویس…', closeThread: 'پایان گفت‌وگو',
    channels: 'لینک‌های رسمی دکو', linksHelp: 'آدرس کامل صفحه یا پیام‌رسان رو وارد کن. فیلد خالی در چت نمایش داده نمی‌شه.',
    knowledge: 'پاسخ‌های تأییدشدهٔ دکو', knowledgeHelp: 'برای هر پاسخ، یک خط به شکل «سؤال => پاسخ» بنویس. دستیار با دیدن همان سؤال، جواب ثبت‌شده رو می‌ده.',
    catalog: 'کاتالوگ محصولات (JSON)', catalogHelp: 'اطلاعات کاتالوگ به دستیار برای پیشنهاد کالا کمک می‌کنه. ساختار فایل در راهنمای نصب آمده.',
    save: 'ذخیره تغییرات', saved: 'تغییرات ذخیره شد.', reloadSettings: 'بارگذاری تنظیمات فعلی',
    password: 'رمز تیم درست نیست.', staffDisabled: 'ابتدا رمز تیم رو روی سرور تنظیم کن.', staffSession: 'دوباره وارد پنل شو.',
    rateLimit: 'تعداد درخواست‌ها زیاد شده. کمی بعد دوباره امتحان کن.', busy: 'دستیار مشغوله. کمی بعد دوباره امتحان کن.',
    invalidLink: 'لینک رسمی و کامل این شبکه رو با https:// وارد کن.', invalidCatalog: 'کاتالوگ با ساختار نمونه سازگار نیست.',
    invalidSettings: 'حجم اطلاعات واردشده بیشتر از حد مجازه.', settingsConflict: 'تنظیمات در دستگاه دیگری تغییر کرده. تنظیمات فعلی رو بارگذاری کن.',
    notWaiting: 'این گفت‌وگو بسته شده.', failed: 'درخواست کامل نشد. دوباره امتحان کن.',
  },
  en: {
    close: 'Close', mascot: 'Deko Dad, a black and gold robot', tagline: 'DEKO marketplace assistant and Deko Mom’s husband',
    askDeko: 'Ask DEKO', assistantLabel: 'DEKO marketplace assistant', support: 'Direct support', chooseRole: 'Conversation role',
    customerChoice: 'I’m a customer', sellerChoice: 'I’m a seller', newChat: 'New chat', chatMessages: 'Conversation messages',
    message: 'Message', messagePlaceholder: 'Write a message…', send: 'Send', official: 'Find DEKO on',
    supportTitle: 'Talk to the DEKO team', handoffNote: 'The DEKO team will see this conversation. Their reply will appear right here.',
    requestSupport: 'Send to support', cancel: 'Cancel', greetingCustomer: 'Hi, I’m Deko Dad. What are you looking for? You can share your budget and delivery destination.',
    greetingSeller: 'Hi, I’m Deko Dad. How can I help you start selling, list an item, or partner with DEKO?',
    shipping: 'I have a shipping question', join: 'How can I become a seller?', listing: 'How do I list a product?',
    order: 'Track my order', returns: 'Returns and exchanges',
    aiNotice: 'Messages in this section are sent to OpenAI to generate answers.', freeGuide: 'Automated help',
    waiting: 'Waiting for support', human: 'Chatting with the DEKO team', closed: 'Conversation closed',
    waitingNote: 'Your conversation is in the team’s inbox. You can add a message here.',
    humanNote: 'The DEKO team will reply here.', closedNote: 'The team closed this conversation. Choose New chat for a different question.',
    writing: 'Deko Dad is preparing a reply…', visitor: 'You', assistant: 'Deko Dad', team: 'DEKO team',
    instagram: 'Instagram', facebook: 'Facebook', telegram: 'Telegram', website: 'Website', ticket: 'Reference', viewProduct: 'View product', worldwide: 'Ships worldwide',
    staffTitle: 'DEKO team panel', backToChat: 'Back to chat', signIn: 'Team sign-in', passwordLabel: 'Team password', signOut: 'Sign out', inbox: 'Support', settingsTab: 'Assistant settings',
    supportQueue: 'Support inbox', emptyQueue: 'There are no support requests yet.', selectThread: 'Select a conversation from the inbox.',
    customer: 'Customer', seller: 'Seller', readThread: 'Support conversation', writeReply: 'Write a team reply…', closeThread: 'Close conversation',
    channels: 'Official DEKO links', linksHelp: 'Enter the full profile or messaging link. Empty channels are hidden in chat.',
    knowledge: 'Approved DEKO replies', knowledgeHelp: 'Write one question => answer per line. The assistant returns the saved reply when the same question is asked.',
    catalog: 'Product catalogue (JSON)', catalogHelp: 'The assistant uses your catalogue to suggest products. See the setup guide for the format.',
    save: 'Save changes', saved: 'Changes saved.', reloadSettings: 'Load current settings',
    password: 'The team password is incorrect.', staffDisabled: 'Set the team password on the server first.', staffSession: 'Sign in to the panel again.',
    rateLimit: 'Too many requests. Try again shortly.', busy: 'The assistant is busy. Try again shortly.',
    invalidLink: 'Enter a complete official link beginning with https://.', invalidCatalog: 'The catalogue does not match the sample format.',
    invalidSettings: 'The information exceeds the size limit.', settingsConflict: 'Settings were changed elsewhere. Load the current settings.',
    notWaiting: 'This conversation is closed.', failed: 'The request failed. Please try again.',
  },
};

export const localize = (lang, key) => labels[lang][key] ?? key;
export const el = id => document.getElementById(id);

export function applyLanguage(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  const alternate = lang === 'fa' ? 'en' : 'fa';
  const languageButton = el('language');
  languageButton.textContent = alternate === 'en' ? 'EN' : 'فارسی';
  languageButton.lang = alternate;
  languageButton.setAttribute('aria-label', alternate === 'en' ? 'English' : 'فارسی');
  const attributes = { i18n: 'textContent', placeholder: 'placeholder', alt: 'alt', aria: 'aria-label' };
  for (const [key, attribute] of Object.entries(attributes)) {
    for (const node of document.querySelectorAll(`[data-${key}]`)) {
      const label = localize(lang, node.dataset[key]);
      if (key === 'i18n') node.textContent = label;
      else node.setAttribute(attribute, label);
    }
  }
}

export function storageGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export function storageSet(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch { /* Some browsers restrict storage in embedded frames. */ }
}

export function requestId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function api(path, { method = 'GET', body, credential } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (credential) headers.Authorization = `Bearer ${credential}`;
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { code: result.error, status: response.status });
  return result;
}

function productCard(product, lang) {
  const card = document.createElement('a');
  card.className = 'product-card';
  card.href = product.url;
  card.rel = 'noopener noreferrer';
  card.target = '_blank';
  const name = document.createElement('strong');
  name.dir = 'auto';
  name.textContent = product.name;
  const price = document.createElement('span');
  price.textContent = new Intl.NumberFormat(lang, { style: 'currency', currency: product.currency, currencyDisplay: 'code' }).format(product.price);
  card.append(name, price);
  if (product.countries.length) {
    const delivery = document.createElement('small');
    const names = new Intl.DisplayNames([lang], { type: 'region' });
    delivery.textContent = product.countries.includes('*') ? localize(lang, 'worldwide') :
      new Intl.ListFormat(lang).format(product.countries.map(country => names.of(country) ?? country));
    card.append(delivery);
  }
  const action = document.createElement('small');
  action.className = 'product-action';
  action.textContent = localize(lang, 'viewProduct');
  card.append(action);
  return card;
}

export function drawMessages(container, messages, lang, { forceScroll = false, note = '' } = {}) {
  const revision = JSON.stringify([lang, note, messages.map(message => [message.id, message.text, message.sender])]);
  if (container.dataset.revision === revision) return;
  const nearEnd = container.scrollHeight - container.clientHeight - container.scrollTop < 54;
  const previousTop = container.scrollTop;
  container.dataset.revision = revision;
  const nodes = messages.map(message => {
    const row = document.createElement('article');
    row.className = `message ${message.sender}`;
    const name = document.createElement('div');
    name.className = 'message-name';
    name.textContent = localize(lang, message.sender);
    const content = document.createElement('p');
    content.dir = 'auto';
    content.textContent = message.text;
    row.append(name, content);
    if (message.products?.length) {
      const products = document.createElement('div');
      products.className = 'products';
      products.append(...message.products.map(product => productCard(product, lang)));
      row.append(products);
    }
    return row;
  });
  if (note) {
    const hint = document.createElement('p');
    hint.className = 'status-note';
    hint.textContent = note;
    nodes.push(hint);
  }
  container.replaceChildren(...nodes);
  container.scrollTop = forceScroll || nearEnd ? container.scrollHeight : previousTop;
}

export function setNotice(node, text = '') {
  node.textContent = text;
  node.hidden = !text;
}
