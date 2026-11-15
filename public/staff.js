import { api, applyLanguage, drawMessages, el, localize, requestId, setNotice, storageGet, storageSet } from '/ui.js';

let lang = storageGet('deko-language') === 'en' ? 'en' : 'fa';
let authenticated = false;
let settingsVersion;
let activeView = 'inbox';
let cases = [];
let selectedId = '';
let selected = null;
let polling = false;
let replying = false;
let replyDraft = null;
const channelIds = ['instagram', 'facebook', 'telegram'];
const notice = el('desk-notice');
const reply = el('reply');
const t = key => localize(lang, key);

function errorLabel(error) {
  if (channelIds.includes(error.code)) return `${t(error.code)} · ${t('invalidLink')}`;
  const codes = { catalog: 'invalidCatalog', settings: 'invalidSettings', tooLarge: 'invalidSettings' };
  const code = codes[error.code] ?? error.code;
  const known = ['password', 'staffDisabled', 'staffSession', 'rateLimit',
    'invalidCatalog', 'invalidSettings', 'settingsConflict', 'notWaiting'];
  return t(known.includes(code) ? code : 'failed');
}

function setSettings(value) {
  settingsVersion = value.version;
  for (const key of channelIds) el(key).value = value.links[key];
  el('knowledge').value = value.knowledge;
  el('catalog').value = JSON.stringify(value.catalog, null, 2);
  el('reload-settings').hidden = true;
}

function setSignedIn(value, settings) {
  authenticated = value;
  el('login').hidden = value;
  el('desk').hidden = !value;
  el('logout').hidden = !value;
  if (value) {
    setSettings(settings);
    showView('inbox');
  } else {
    selectedId = '';
    selected = null;
    cases = [];
    reply.value = '';
    replyDraft = null;
    renderInbox();
  }
}

function showView(view) {
  activeView = view;
  for (const name of ['inbox', 'settings']) {
    el(name).hidden = name !== view;
    el(`show-${name}`).setAttribute('aria-pressed', String(name === view));
  }
  setNotice(notice);
  if (view === 'inbox') void poll();
}

function renderInbox() {
  const caseList = el('case-list');
  const revision = JSON.stringify([lang, selectedId, cases]);
  if (caseList.dataset.revision !== revision) {
    caseList.dataset.revision = revision;
    const focusedId = document.activeElement?.dataset.threadId;
    caseList.replaceChildren(...cases.map(thread => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      const name = document.createElement('strong');
      const state = document.createElement('span');
      button.type = 'button';
      button.dataset.threadId = thread.id;
      button.setAttribute('aria-current', String(thread.id === selectedId));
      name.textContent = t(thread.role) + ' · ' + t(thread.channel) + ' · DEKO-' + thread.id.slice(-8).toUpperCase();
      state.textContent = t(thread.status);
      button.append(name, state);
      button.onclick = () => void pickThread(thread.id);
      row.append(button);
      return row;
    }));
    if (focusedId) [...caseList.querySelectorAll('button')].find(button => button.dataset.threadId === focusedId)?.focus();
  }
  el('empty-queue').hidden = cases.length > 0;
  el('thread-status').textContent = selected ? `${t(selected.role)} · ${t(selected.status)}` : '';
  const open = Boolean(selected && selected.status !== 'closed');
  el('reply-form').hidden = !open;
  el('close-thread').hidden = !open;
  el('reply-send').disabled = replying || !reply.value.trim();
  el('close-thread').disabled = replying;
  reply.disabled = replying;
  drawMessages(el('thread-messages'), selected?.messages ?? [], lang, {
    note: selected ? '' : t('selectThread'),
  });
}

function setSelected(thread) {
  if (thread.id !== selectedId) return;
  const stale = selected && (thread.updated < selected.updated || (selected.status === 'closed' && thread.status !== 'closed'));
  if (stale) return;
  selected = thread;
  renderInbox();
}

function deskError(error) {
  if (error.status === 401) {
    setSignedIn(false);
    setNotice(el('login-notice'), t('staffSession'));
  } else setNotice(notice, errorLabel(error));
}

async function poll() {
  if (polling || !authenticated || activeView !== 'inbox') return;
  polling = true;
  const id = selectedId;
  try {
    const [queue, thread] = await Promise.all([
      api('/api/staff/queue'),
      id ? api(`/api/staff/thread/${id}`) : null,
    ]);
    if (!authenticated) return;
    cases = queue.threads;
    if (thread) setSelected(thread);
    renderInbox();
  } catch (error) { deskError(error); }
  finally { polling = false; }
}

async function pickThread(id) {
  if (id !== selectedId) {
    selectedId = id;
    selected = null;
    reply.value = '';
    replyDraft = null;
    renderInbox();
  }
  try { setSelected(await api(`/api/staff/thread/${id}`)); }
  catch (error) { deskError(error); }
}

el('language').onclick = () => {
  lang = lang === 'fa' ? 'en' : 'fa';
  storageSet('deko-language', lang);
  applyLanguage(lang);
  renderInbox();
};
el('login').onsubmit = async event => {
  event.preventDefault();
  const button = el('login-action');
  button.disabled = true;
  setNotice(el('login-notice'));
  try {
    await api('/api/staff/login', { method: 'POST', body: { password: el('team-password').value } });
    el('team-password').value = '';
    setSignedIn(true, await api('/api/staff/settings'));
  } catch (error) { setNotice(el('login-notice'), errorLabel(error)); }
  finally { button.disabled = false; }
};
el('logout').onclick = async () => {
  try { await api('/api/staff/logout', { method: 'POST' }); setSignedIn(false); }
  catch (error) { deskError(error); }
};
el('show-inbox').onclick = () => showView('inbox');
el('show-settings').onclick = () => showView('settings');
reply.oninput = () => { el('reply-send').disabled = replying || !reply.value.trim(); };

el('reply-form').onsubmit = async event => {
  event.preventDefault();
  const id = selectedId;
  const text = reply.value.trim();
  if (replying || !id || !text) return;
  if (!replyDraft || text !== replyDraft.text) replyDraft = { text, requestId: requestId() };
  replying = true;
  setNotice(notice);
  renderInbox();
  try {
    const thread = await api(`/api/staff/thread/${id}/reply`, { method: 'POST', body: replyDraft });
    if (selectedId === id) {
      reply.value = '';
      replyDraft = null;
      setSelected(thread);
    }
    void poll();
  } catch (error) { deskError(error); }
  finally { replying = false; renderInbox(); }
};
el('close-thread').onclick = async () => {
  if (!selectedId) return;
  try {
    setSelected(await api(`/api/staff/thread/${selectedId}/close`, { method: 'POST' }));
    void poll();
  } catch (error) { deskError(error); }
};

el('settings').onsubmit = async event => {
  event.preventDefault();
  const status = el('settings-notice');
  const saveButton = el('save');
  saveButton.disabled = true;
  setNotice(status);
  try {
    let catalog;
    try { catalog = JSON.parse(el('catalog').value.trim() || '[]'); }
    catch { throw Object.assign(new Error('catalog'), { code: 'catalog' }); }
    const links = Object.fromEntries(channelIds.map(key => [key, el(key).value.trim()]));
    const value = await api('/api/staff/settings', { method: 'PUT', body: { version: settingsVersion, links, catalog, knowledge: el('knowledge').value } });
    setSettings(value);
    status.className = 'form-note success';
    setNotice(status, t('saved'));
  } catch (error) {
    if (error.status === 401) deskError(error);
    status.className = 'form-note error';
    setNotice(status, errorLabel(error));
    if (error.code === 'settingsConflict') el('reload-settings').hidden = false;
  } finally { saveButton.disabled = false; }
};
el('reload-settings').onclick = async () => {
  try { setSettings(await api('/api/staff/settings')); setNotice(el('settings-notice')); }
  catch (error) { deskError(error); }
};

applyLanguage(lang);
api('/api/staff/settings').then(settings => setSignedIn(true, settings)).catch(error => {
  setSignedIn(false);
  if (error.status !== 401) setNotice(el('login-notice'), errorLabel(error));
});
setInterval(() => { if (!document.hidden) void poll(); }, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void poll(); });
