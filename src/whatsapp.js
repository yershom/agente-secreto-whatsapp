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
      const sender = msg.fromMe ? 'Yo' : contact.name || msg.from.split('@')[0];

      // Usar nombre del contacto para la carpeta, si no hay usar número
      let folderName = contact.name || msg.from.split('@')[0];
      folderName = folderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

      const text = msg.body || '[Archivo adjunto]';

      console.log(`📝 [${folderName}] ${sender}: ${text.substring(0, 60)}`);
      saveMessage(folderName, sender, text);

      // Media detection
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          console.log(`📎 Adjunto detectado en ${folderName}: ${media.filename || media.mimetype}`);
        } catch (e) {
          console.log(`📎 Adjunto no descargable en ${folderName}`);
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
