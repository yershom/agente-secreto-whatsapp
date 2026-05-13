import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { saveMessage } from './storage.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startWhatsApp() {
  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, '..', 'auth_info')
    })
  });

  client.on('qr', (qr) => {
    console.log('\n\n📱 📱 📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP 📱 📱 📱\n');
    qrcode.generate(qr, { small: true });
    console.log('\n');
  });

  client.on('ready', () => {
    console.log('\n✅ ✅ ✅ ¡CONECTADO A WHATSAPP! ✅ ✅ ✅\n');
    console.log('Registrando conversaciones en: ./conversations/');
  });

  client.on('message', async (msg) => {
    try {
      const contact = await msg.getContact();
      const sender = msg.from.includes('@g.us')
        ? contact.name || msg.from.split('@')[0]
        : msg.fromMe
          ? 'Yo'
          : contact.name || msg.from.split('@')[0];

      const text = msg.body || '[Archivo adjunto]';

      const chatId = msg.from.split('@')[0];
      console.log(`📝 [${chatId}] ${sender}: ${text.substring(0, 60)}`);
      saveMessage(chatId, sender, text);

      // Media detection
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          console.log(`📎 Adjunto detectado en ${chatId}: ${media.filename || media.mimetype}`);
        } catch (e) {
          console.log(`📎 Adjunto no descargable en ${chatId}`);
        }
      }
    } catch (e) {
      console.error('Error procesando mensaje:', e.message);
    }
  });

  client.on('disconnected', (reason) => {
    console.log(`❌ Desconectado: ${reason}`);
  });

  client.on('auth_failure', () => {
    console.log('❌ Autenticación fallida. Elimina auth_info/ e intenta nuevamente.');
  });

  await client.initialize();
  return client;
}
