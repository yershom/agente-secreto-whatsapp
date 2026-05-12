import { default as makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
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
    printQRInTerminal: true
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
      console.log('Conexión cerrada. Reconectando...', shouldReconnect);
      if (shouldReconnect) {
        startWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('✓ Conectado a WhatsApp');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const contact = msg.key.remoteJid.split('@')[0];
    const sender = msg.key.fromMe ? 'Yo' : (msg.pushName || contact);
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '[Archivo adjunto]';

    saveMessage(contact, sender, text);

    // Procesar adjuntos si existen
    if (msg.message.imageMessage || msg.message.videoMessage || msg.message.documentMessage) {
      try {
        const media = msg.message.imageMessage || msg.message.videoMessage || msg.message.documentMessage;
        const filename = media.filename || `${Date.now()}_${media.mimetype?.split('/')[1] || 'file'}`;
        // La descarga de media requiere procesamiento adicional
        console.log(`Adjunto detectado: ${filename} (procesamiento manual requerido)`);
      } catch (e) {
        console.error('Error procesando adjunto:', e);
      }
    }
  });

  return sock;
}
