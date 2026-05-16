import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { saveMessage, saveAttachment, backupChat, deduplicateChat } from './storage.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FLAG = path.join(__dirname, '..', 'conversations', '.history_downloaded');

async function loadAllMessages(chat) {
  let hasMore = true;
  let iterations = 0;
  const MAX_ITERATIONS = 200;
  while (hasMore && iterations < MAX_ITERATIONS) {
    hasMore = await chat.loadEarlierMessages();
    if (hasMore) await new Promise(r => setTimeout(r, 300));
    iterations++;
  }
}

async function downloadHistoryOnce(client) {
  if (fs.existsSync(HISTORY_FLAG)) {
    console.log('📋 Historial ya descargado anteriormente. Saltando...\n');
    return;
  }

  try {
    const convDir = path.join(__dirname, '..', 'conversations');
    if (fs.existsSync(convDir)) {
      for (const dir of fs.readdirSync(convDir)) {
        backupChat(dir);
      }
    }
    console.log('💾 Backup de conversaciones existentes completado.');

    const FULL_HISTORY_CHATS = new Set(['Candy', 'Psic_logo_Aras', '_52_734_141_1968']);
    const chats = await client.getChats();
    console.log(`📊 Encontrados ${chats.length} chats. Descargando historial...`);
    console.log('⏱️  Esto puede tomar unos minutos...\n');

    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      let folderName;

      if (chat.isGroup) {
        folderName = chat.name || chat.id._serialized.split('@')[0];
      } else {
        const contact = await chat.getContact();
        folderName = contact.name || chat.id._serialized.split('@')[0];
      }

      folderName = folderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

      try {
        if (FULL_HISTORY_CHATS.has(folderName)) {
          console.log(`  ⏳ Cargando historial completo de ${folderName}...`);
          await loadAllMessages(chat);
        }
        const limit = FULL_HISTORY_CHATS.has(folderName) ? 99999 : 100;
        const messages = await chat.fetchMessages({ limit });

        if (messages.length > 0) {
          console.log(`  [${i + 1}/${chats.length}] 📁 ${folderName}: ${messages.length} mensajes`);

          // Guardar en orden (más antiguos primero)
          for (const msg of messages.reverse()) {
            try {
              const contact = await msg.getContact();
              const sender = msg.fromMe ? 'Yo' : contact.name || msg.from.split('@')[0];
              const text = msg.body || '[Archivo adjunto]';

              saveMessage(folderName, sender, text);

              if (msg.hasMedia) {
                try {
                  const media = await msg.downloadMedia();
                  if (media) {
                    const ext = media.mimetype ? media.mimetype.split('/')[1] : 'bin';
                    const filename = media.filename || `${msg.timestamp || Date.now()}.${ext}`;
                    await saveAttachment(folderName, filename, Buffer.from(media.data, 'base64'));
                  }
                } catch (e) {
                  // Ignorar errores de adjuntos individuales del historial
                }
              }
            } catch (e) {
              // Ignorar errores de mensajes individuales
            }
          }
          deduplicateChat(folderName);
        }
      } catch (e) {
        console.warn(`  ⚠️  ${folderName}: ${e.message}`);
        // Continuar con siguiente chat
      }
    }

    fs.writeFileSync(HISTORY_FLAG, new Date().toISOString());
    console.log('\n✓ Descarga de historial completada');
  } catch (error) {
    console.warn('⚠️  Aviso descargando historial:', error.message);
    console.log('Continuando sin historial completo...\n');
  }
}

function cleanChromiumLocks(dataPath) {
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  function deleteInDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      if (lockFiles.includes(entry)) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`🧹 Lock eliminado: ${fullPath}`);
        } catch (e) { /* ignorar si ya no existe */ }
      } else {
        try {
          if (fs.statSync(fullPath).isDirectory()) deleteInDir(fullPath);
        } catch (e) { /* ignorar errores de stat */ }
      }
    }
  }
  deleteInDir(dataPath);
}

export async function startWhatsApp() {
  const authDataPath = path.join(__dirname, '..', 'auth_info');
  cleanChromiumLocks(authDataPath);

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: authDataPath
    }),
    puppeteer: {
      headless: true,
      executablePath: '/usr/bin/chromium',  // Usar Chromium del sistema
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    },
    protocolTimeout: 180000  // 3 minutos para descargas lentas
  });

  client.on('qr', (qr) => {
    console.log('\n\n📱 📱 📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP COMO ADMINISTRADOR DEL BOT 📱 📱\n');
    qrcode.generate(qr, { small: true });
    console.log('\n');
  });

  client.on('ready', async () => {
    console.log('\n✅ ✅ ✅ ¡CONECTADO A WHATSAPP! ✅ ✅ ✅\n');
    console.log('Registrando conversaciones en: ./conversations/');

    // Descargar historial existente
    console.log('\n📥 Descargando historial de conversaciones...');
    await downloadHistoryOnce(client);
    console.log('✓ Historial descargado. Ahora escuchando nuevos mensajes.\n');
  });

  client.on('message_create', async (msg) => {
    try {
      const contact = await msg.getContact();
      const chat = await msg.getChat();

      // Detectar si es un grupo
      const isGroup = chat.isGroup;
      let folderName;
      let sender;

      if (isGroup) {
        // En grupos: usar nombre del grupo
        folderName = chat.name || msg.from.split('@')[0];
        sender = msg.fromMe ? 'Yo' : contact.name || msg.from.split('@')[0];
      } else {
        // En chats 1a1: usar nombre del contacto
        folderName = contact.name || msg.from.split('@')[0];
        sender = msg.fromMe ? 'Yo' : contact.name || msg.from.split('@')[0];
      }

      // Limpiar nombre de carpeta
      folderName = folderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

      const text = msg.body || '[Archivo adjunto]';
      const type = isGroup ? '👥' : '💬';

      console.log(`${type} 📝 [${folderName}] ${sender}: ${text.substring(0, 60)}`);
      saveMessage(folderName, sender, text);

      // Media detection
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media) {
            const ext = media.mimetype ? media.mimetype.split('/')[1] : 'bin';
            const filename = media.filename || `${Date.now()}.${ext}`;
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
