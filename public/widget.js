(() => {
  const script = document.currentScript;
  if (!script || document.getElementById('deko-assistant-launcher')) return;
  const origin = new URL(script.src).origin;
  const language = () => (script.dataset.lang || document.documentElement.lang).toLowerCase().startsWith('en') ? 'en' : 'fa';
  const launcher = document.createElement('button');
  launcher.id = 'deko-assistant-launcher';
  launcher.type = 'button';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'deko-assistant-widget');
  Object.assign(launcher.style, {
    position: 'fixed', right: 'max(16px, env(safe-area-inset-right))', bottom: 'max(16px, env(safe-area-inset-bottom))',
    zIndex: '2147483000', display: 'flex', alignItems: 'center', gap: '6px', minHeight: '52px',
    padding: '5px 14px 5px 7px', color: '#f2d495', background: '#1b1916', border: '1px solid #bca071',
    borderRadius: '32px', boxShadow: '0 6px 24px #0006', font: '600 15px system-ui, sans-serif', cursor: 'pointer',
  });
  const mascot = document.createElement('img');
  mascot.src = `${origin}/deko-dad.webp`;
  mascot.alt = '';
  mascot.width = 42;
  mascot.height = 42;
  const label = document.createElement('span');
  launcher.append(mascot, label);

  const frame = document.createElement('iframe');
  frame.id = 'deko-assistant-widget';
  frame.hidden = true;
  frame.referrerPolicy = 'no-referrer';
  Object.assign(frame.style, {
    position: 'fixed', right: 'max(10px, env(safe-area-inset-right))', bottom: 'max(10px, env(safe-area-inset-bottom))',
    zIndex: '2147483001', width: 'min(440px, calc(100vw - 20px))', height: 'min(720px, calc(100dvh - 20px))',
    border: '1px solid #735b3d', borderRadius: '17px', background: '#131312', boxShadow: '0 14px 48px #0008',
  });

  function refreshLabel() {
    const english = language() === 'en';
    label.textContent = english ? 'Ask DEKO' : 'از دکو بپرس';
    frame.title = english ? 'DEKO assistant' : 'دستیار دکو';
  }

  launcher.onclick = () => {
    if (!frame.getAttribute('src')) frame.src = `${origin}/chat?embed=1&lang=${language()}`;
    frame.hidden = false;
    launcher.style.display = 'none';
    launcher.setAttribute('aria-expanded', 'true');
    frame.focus();
  };

  window.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== frame.contentWindow || event.data?.type !== 'deko-assistant-close') return;
    frame.hidden = true;
    launcher.style.display = 'flex';
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  });
  new MutationObserver(refreshLabel).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  refreshLabel();
  const mount = () => document.body.append(launcher, frame);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
