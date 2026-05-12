import { default as makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { saveMessage, saveAttachment } from './storage.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, '..', 'auth_info')
  );

  const sock = makeWASocket({
    auth: state,
    defaultQueryTimeoutMs: 60_000
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n\n📱 📱 📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP 📱 📱 📱\n');
      qrcode.generate(qr, { small: true });
      console.log('\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== 401;

      if (statusCode === 401) {
        console.log('❌ Sesión expirada. Por favor ejecuta nuevamente para generar un nuevo QR.');
      } else {
        console.log(`⚠️ Desconectado (código: ${statusCode}). Reconectando en 3s...`);
        if (shouldReconnect) {
          setTimeout(() => startWhatsApp(), 3000);
        }
      }
    } else if (connection === 'open') {
      console.log('\n✅ ✅ ✅ ¡CONECTADO A WHATSAPP! ✅ ✅ ✅\n');
      console.log('Registrando conversaciones en: ./conversations/');
    } else if (connection === 'connecting') {
      console.log('⏳ Conectando...');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message) return;

      const contact = msg.key.remoteJid.split('@')[0];
      const sender = msg.key.fromMe ? 'Yo' : (msg.pushName || contact);
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '[Archivo adjunto]';

      console.log(`📝 [${contact}] ${sender}: ${text.substring(0, 60)}`);
      saveMessage(contact, sender, text);

      if (msg.message.imageMessage || msg.message.videoMessage || msg.message.documentMessage) {
        const media = msg.message.imageMessage || msg.message.videoMessage || msg.message.documentMessage;
        const filename = media.filename || `${Date.now()}_${media.mimetype?.split('/')[1] || 'file'}`;
        console.log(`📎 Adjunto detectado en ${contact}: ${filename}`);
      }
    } catch (e) {
      console.error('Error procesando mensaje:', e.message);
    }
  });

  return sock;
}
