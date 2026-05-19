import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error('Define TELEGRAM_BOT_TOKEN en .env primero.');
  process.exit(1);
}

const api = (method, params = {}) => {
  const q = new URLSearchParams(params).toString();
  const url = `https://api.telegram.org/bot${token}/${method}${q ? `?${q}` : ''}`;
  return fetch(url).then((r) => r.json());
};

const webhook = await api('getWebhookInfo');
if (webhook.ok && webhook.result?.url) {
  console.log('Webhook activo detectado, desactivando temporalmente para leer mensajes...');
  const del = await api('deleteWebhook', { drop_pending_updates: 'false' });
  if (!del.ok) {
    console.error('No se pudo quitar webhook:', del.description);
    process.exit(1);
  }
}

console.log('1. Abre tu bot en Telegram y envíale cualquier mensaje (ej: hola)');
console.log('2. Leyendo actualizaciones...\n');

const data = await api('getUpdates');

if (!data.ok) {
  console.error('Error API:', data.description);
  process.exit(1);
}

if (!data.result?.length) {
  console.log('Sin mensajes aún. Escribe al bot y vuelve a ejecutar:');
  console.log('  npm run telegram:chat-id');
  process.exit(0);
}

const seen = new Set();
for (const u of data.result) {
  const chat = u.message?.chat ?? u.edited_message?.chat;
  if (!chat || seen.has(chat.id)) continue;
  seen.add(chat.id);
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || '?';
  console.log(`TELEGRAM_CHAT_ID=${chat.id}  (${name}, tipo: ${chat.type})`);
}

console.log('\nCopia TELEGRAM_CHAT_ID=... a tu archivo .env');
