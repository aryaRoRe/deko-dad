import { api, applyLanguage, drawMessages, el, localize, requestId, setNotice, storageGet, storageSet } from '/ui.js';

const query = new URLSearchParams(location.search);
const embedded = query.get('embed') === '1' && window.parent !== window;
let lang = query.get('lang') === 'en' || (!query.has('lang') && storageGet('deko-language') === 'en') ? 'en' : 'fa';
let role = 'customer';
let credential = storageGet('deko-visitor');
let thread = null;
let config = { links: {}, aiConfigured: false, staffConfigured: false };
let creating = null;
let sending = false;
let requesting = false;
let lastDraft = null;
const statuses = ['assistant', 'waiting', 'human', 'closed'];
const t = key => localize(lang, key);
const messages = el('messages');
const input = el('message-input');
const errorNote = el('chat-error');
const dialog = el('support-dialog');

if (embedded) {
  document.body.classList.add('is-widget');
  el('close-widget').hidden = false;
  el('close-widget').onclick = () => window.parent.postMessage({ type: 'deko-assistant-close' }, '*');
}

function setThread(value) {
  if (thread?.id === value.id && (value.updated < thread.updated || statuses.indexOf(value.status) < statuses.indexOf(thread.status))) return;
  thread = value;
  role = value.role;
  render();
}

function render() {
  const state = thread?.status ?? 'assistant';
  const status = state === 'assistant' ? t(config.aiConfigured ? 'assistantLabel' : 'freeGuide') : t(state);
  el('chat-status').textContent = status;
  el('staff-link').hidden = embedded || !config.staffConfigured;
  el('support').hidden = state !== 'assistant';
  el('reset').hidden = !thread;
  el('reset').disabled = sending || requesting;
  el('chat-notice').hidden = state !== 'assistant' || config.aiConfigured !== true;
  el('message-form').hidden = state === 'closed';
  el('send').disabled = sending || !input.value.trim();
  input.disabled = sending;
  for (const button of document.querySelectorAll('.role')) {
    button.setAttribute('aria-pressed', String(button.dataset.role === role));
    button.disabled = Boolean(thread || credential) || sending || requesting;
  }

  const history = thread?.messages ?? [];
  const greeting = { id: 'greeting', sender: 'assistant', text: t(role === 'seller' ? 'greetingSeller' : 'greetingCustomer') };
  const note = state === 'assistant' ? (sending ? t('writing') : '') :
    t(state + 'Note') + ' ' + t('ticket') + ' DEKO-' + thread.id.slice(-8).toUpperCase();
  drawMessages(messages, [greeting, ...history], lang, { note, forceScroll: sending });

  const shortcuts = el('suggestions');
  shortcuts.hidden = history.length > 0 || state !== 'assistant' || sending;
  const revision = `${lang}-${role}`;
  if (shortcuts.dataset.revision !== revision) {
    shortcuts.dataset.revision = revision;
    const options = role === 'seller' ? ['join', 'listing'] : ['order', 'shipping', 'returns'];
    shortcuts.replaceChildren(...options.map(key => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = t(key);
      button.onclick = () => { input.value = t(key); el('message-form').requestSubmit(); };
      return button;
    }));
  }

  const social = el('social-links');
  const socialRevision = JSON.stringify([lang, config.links]);
  if (social.dataset.revision !== socialRevision) {
    social.dataset.revision = socialRevision;
    const links = Object.entries(config.links).filter(([, link]) => link).map(([channel, link]) => {
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = t(channel);
      return anchor;
    });
    social.replaceChildren(...links);
    el('social').hidden = !links.length;
  }
}

function refreshPublic() {
  return api('/api/public').then(result => { config = result; render(); }).catch(() => {});
}

async function refreshThread() {
  const currentCredential = credential;
  if (!currentCredential) return;
  try {
    const value = await api('/api/conversation', { credential: currentCredential });
    if (currentCredential === credential) setThread(value);
  } catch (error) {
    if (error.status === 401 && currentCredential === credential) resetConversation();
  }
}

function resetConversation() {
  credential = null;
  thread = null;
  lastDraft = null;
  storageSet('deko-visitor', null);
  input.value = '';
  setNotice(errorNote);
  render();
}

async function ensureThread() {
  if (credential) return credential;
  if (!creating) {
    creating = api('/api/conversations', { method: 'POST', body: { role, lang } }).then(result => {
      credential = result.credential;
      storageSet('deko-visitor', credential);
      setThread(result.thread);
      return credential;
    }).finally(() => { creating = null; });
  }
  return creating;
}

function publicError(error) {
  return t(['busy', 'rateLimit', 'closed'].includes(error.code) ? error.code : 'failed');
}

el('language').onclick = () => {
  lang = lang === 'fa' ? 'en' : 'fa';
  storageSet('deko-language', lang);
  applyLanguage(lang);
  render();
};
for (const button of document.querySelectorAll('.role')) button.onclick = () => { role = button.dataset.role; render(); };
el('reset').onclick = () => { resetConversation(); input.focus(); };
input.oninput = () => { el('send').disabled = sending || !input.value.trim(); };

el('message-form').onsubmit = async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (sending || !text) return;
  if (!lastDraft || text !== lastDraft.text) lastDraft = { text, requestId: requestId() };
  sending = true;
  setNotice(errorNote);
  render();
  try {
    const currentCredential = await ensureThread();
    const value = await api('/api/conversation/message', { credential: currentCredential, method: 'POST', body: { ...lastDraft, lang } });
    setThread(value);
    input.value = '';
    lastDraft = null;
  } catch (error) {
    setNotice(errorNote, publicError(error));
    if (error.status === 409) await refreshThread();
  } finally {
    sending = false;
    render();
    if (!dialog.open && thread?.status !== 'closed') input.focus();
  }
};

el('support').onclick = () => {
  setNotice(el('support-error'));
  dialog.showModal();
};
el('confirm-support').onclick = async event => {
  if (requesting) return;
  const button = event.currentTarget;
  requesting = true;
  button.disabled = true;
  setNotice(el('support-error'));
  render();
  try {
    const currentCredential = await ensureThread();
    const value = await api('/api/conversation/support', { credential: currentCredential, method: 'POST' });
    setThread(value);
    dialog.close();
    input.focus();
  } catch (error) {
    setNotice(el('support-error'), publicError(error));
  } finally {
    requesting = false;
    button.disabled = false;
    render();
  }
};

applyLanguage(lang);
render();
void refreshPublic();
void refreshThread();
setInterval(() => {
  if (!document.hidden && ['waiting', 'human'].includes(thread?.status)) void refreshThread();
}, 3000);
setInterval(() => { if (!document.hidden) void refreshPublic(); }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { void refreshPublic(); void refreshThread(); } });
