const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
const origin = process.env.DEKO_PUBLIC_ORIGIN ?? '';
if (!/^\d+:[A-Za-z0-9_-]{20,100}$/.test(token) || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
  console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in your local environment.');
  process.exit(1);
}

async function telegram(method, body = {}) {
  const response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(method + ' returned HTTP ' + response.status);
  return payload.result;
}

try {
  const site = new URL(origin);
  if (site.protocol !== 'https:' || site.origin !== origin.replace(/\/$/, '')) throw new Error('Use the deployed HTTPS origin.');
  const webhookUrl = site.origin + '/webhooks/telegram';
  const health = await fetch(site.origin + '/healthz', { signal: AbortSignal.timeout(10000) });
  if (!health.ok || (await health.json()).telegramConfigured !== true) throw new Error('Deploy and set the Telegram runtime secrets first.');

  const bot = await telegram('getMe');
  const current = await telegram('getWebhookInfo');
  if (current.url && current.url !== webhookUrl) {
    throw new Error('This bot already uses a different webhook. Use the intended bot account or remove the previous webhook first.');
  }

  await telegram('setWebhook', { url: webhookUrl, secret_token: secret, allowed_updates: ['message'], max_connections: 1 });
  const confirmed = await telegram('getWebhookInfo');
  if (confirmed.url !== webhookUrl) throw new Error('Telegram did not confirm the new webhook.');
  console.log('Telegram connected. Open https://t.me/' + bot.username + ' and send /start.');
} catch (error) {
  console.error('Telegram setup failed:', error.message.replaceAll(token, '[secret]').replaceAll(secret, '[secret]'));
  process.exitCode = 1;
}
