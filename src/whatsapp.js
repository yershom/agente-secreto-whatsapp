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
    console.log('\n\n📱 📱 📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP COMO ADMINISTRADOR DEL BOT 📱 📱\n');
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
          if (media) {
            // Guardar archivo adjunto
            const { saveAttachment } = await import('./storage.js');
            const filename = media.filename || `${Date.now()}.${media.mimetype.split('/')[1]}`;
            await saveAttachment(folderName, filename, Buffer.from(media.data, 'base64'));
            console.log(`📎 Adjunto guardado en ${folderName}: ${filename}`);
          }
        } catch (e) {
          console.log(`⚠️ No se pudo descargar adjunto en ${folderName}: ${e.message}`);
        }
      }
    } catch (e) {
      console.error('Error procesando mensaje:', e.message);
    }
  });

  client.on('disconnected', (reason) => {
    console.log(`\n❌ ❌ ❌ Desconectado: ${reason} ❌ ❌ ❌\n`);
    console.log('Reconectando en 5 segundos...');
    setTimeout(() => {
      console.log('Reintentando conexión...');
      client.initialize().catch(e => console.error('Error reconectando:', e.message));
    }, 5000);
  });

  client.on('auth_failure', (msg) => {
    console.log(`\n❌ ❌ ❌ Autenticación fallida ❌ ❌ ❌`);
    console.log(`Motivo: ${msg}`);
    console.log('Por favor, elimina auth_info/ e intenta nuevamente:\n');
    console.log('  rm -rf auth_info/ .wwebjs_cache/');
    console.log('  npm start\n');
  });

  client.on('change_state', (state) => {
    console.log(`📡 Estado: ${state}`);
  });

  try {
    await client.initialize();
    console.log('✓ Cliente wa-web.js inicializado');
  } catch (error) {
    console.error('Error inicializando cliente:', error.message);
    throw error;
  }

  return client;
}
