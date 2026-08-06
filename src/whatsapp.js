import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, Message } = pkg;
import qrcode from 'qrcode-terminal';
import { saveMessage, saveAttachment, backupChat, deduplicateChat } from './storage.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FLAG = path.join(__dirname, '..', 'conversations', '.history_downloaded');

const FULL_HISTORY_CHATS = new Set(['Candy', 'Psic_logo_Aras', '_52_734_141_1968', 'Karem', 'Hanani_Herrera', '211552993050832', 'Ibrahim_Gatito_WS', 'Rafael_Procurador_DIF', 'Gersom', 'Nora_Herrera']);

// Pin de versión de WhatsApp Web (OPT-IN, desactivado por defecto). Se probó para arreglar la
// descarga de media, pero las versiones viejas compatibles con la librería son rechazadas por
// WhatsApp (navegación forzada) y las nuevas rompen igual. Se deja como palanca configurable:
// define WA_WEB_VERSION=<version> en .env para fijarla. Por defecto 'none' = sin pin.
const WA_WEB_VERSION = process.env.WA_WEB_VERSION ?? 'none';

async function downloadMediaWithTimeout(msg, timeoutMs = 30000) {
  return Promise.race([
    msg.downloadMedia(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout descargando media')), timeoutMs)
    )
  ]);
}

// Enumera los IDs de todos los chats directamente de la colección interna.
// client.getChats() no sirve: hace Promise.all(chats.map(getChatModel)) y si UN solo
// chat no serializa, rechaza todo con el error minificado "r".
async function enumerateChatIds(client) {
  return client.pupPage.evaluate(() => {
    // Accessor de wa-web.js 1.34.x; window.Store.Chat como respaldo para versiones viejas
    try {
      return window.require('WAWebCollections').Chat.getModelsArray().map(c => c.id._serialized);
    } catch (e) {
      try {
        return window.Store.Chat.getModelsArray().map(c => c.id._serialized);
      } catch (e2) {
        return [];
      }
    }
  });
}

// Descarga el historial completo de un chat SIN pasar por getChatModel (que truena en
// grupos @g.us y contactos @lid por groupMetadata.update()/toPn). Replica la lógica de
// Chat.fetchMessages tomando el chatId directo y reconstruye objetos Message para que
// la descarga de media siga funcionando. Devuelve { info, messages } o null.
async function fetchChatHistory(client, chatId, limit = 99999) {
  const result = await client.pupPage.evaluate(async (chatId, limit) => {
    // Descartar notificaciones de sistema, PERO conservar los registros de llamada (call_log)
    const msgFilter = (m) => !m.isNotification || m.type === 'call_log';
    let chat;
    try {
      chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
    } catch (e) {
      return null;
    }
    if (!chat || !chat.msgs) return null;

    let msgs = chat.msgs.getModelsArray().filter(msgFilter);
    while (msgs.length < limit) {
      let loaded;
      try {
        loaded = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
      } catch (e) {
        break;
      }
      if (!loaded || !loaded.length) break;
      msgs = [...loaded.filter(msgFilter), ...msgs];
    }
    if (msgs.length > limit) {
      msgs.sort((a, b) => (a.t > b.t ? 1 : -1));
      msgs = msgs.splice(msgs.length - limit);
    }

    const info = {
      isGroup: !!chat.groupMetadata || /@g\.us$/.test(chatId),
      name: chat.formattedTitle || chat.name || null,
    };
    return { info, messages: msgs.map((m) => window.WWebJS.getMessageModel(m)) };
  }, chatId, limit);

  if (!result) return null;
  return {
    info: result.info,
    messages: result.messages.map((m) => new Message(client, m)),
  };
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

    console.log('⏳ Esperando inicialización del Store de WhatsApp...');
    await new Promise(r => setTimeout(r, 5000));

    const chatIds = await enumerateChatIds(client);
    console.log(`📊 Encontrados ${chatIds.length} chats. Descargando historial...`);
    console.log('⏱️  Esto puede tomar bastante tiempo...\n');

    for (let i = 0; i < chatIds.length; i++) {
      const chatId = chatIds[i];
      try {
        const res = await fetchChatHistory(client, chatId, 99999);
        if (!res) {
          console.log(`  ⏭️  [${i + 1}/${chatIds.length}] ${chatId}: sin datos`);
          continue;
        }

        const rawName = res.info.name || chatId.split('@')[0];
        const folderName = rawName.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
        const messages = res.messages;

        if (messages.length === 0) {
          console.log(`  ▫️  [${i + 1}/${chatIds.length}] ${folderName}: 0 mensajes`);
          continue;
        }

        console.log(`  📁 [${i + 1}/${chatIds.length}] ${folderName}: ${messages.length} mensajes`);

        // fetchMessages devuelve del más antiguo al más reciente
        for (const msg of messages) {
          try {
            // Registros de llamada del historial (call_log): formatear como en tiempo real
            if (msg.type === 'call_log') {
              const sub = (msg._data?.subtype || '').toLowerCase();
              const isVideo = sub.includes('video') || /video/i.test(msg.body || '');
              const callType = isVideo ? 'VIDEOLLAMADA' : 'LLAMADA';
              const direction = msg.fromMe ? 'saliente' : 'entrante';
              const status = sub.includes('miss') ? ' perdida' : '';
              const dur = msg.body ? ` - ${msg.body}` : '';
              saveMessage(folderName, 'LLAMADA', `[${callType} ${direction}${status}${dur}]`, msg.timestamp);
              continue;
            }

            // Nombre del remitente sin round-trip por mensaje: pushname del modelo, o número
            const sender = msg.fromMe
              ? 'Yo'
              : (msg._data?.notifyName || (msg.author || msg.from || '').split('@')[0] || 'Desconocido');
            const text = msg.body || '[Archivo adjunto]';

            saveMessage(folderName, sender, text, msg.timestamp);

            if (msg.hasMedia) {
              try {
                const media = await downloadMediaWithTimeout(msg);
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
      } catch (e) {
        console.warn(`  ⚠️  [${i + 1}/${chatIds.length}] ${chatId}: ${e?.message || String(e)}`);
        // Continuar con siguiente chat
      }
    }

    if (chatIds.length > 0) {
      fs.writeFileSync(HISTORY_FLAG, new Date().toISOString());
      console.log('\n✓ Descarga de historial completada');
    } else {
      console.warn('\n⚠️  No se pudo obtener ningún chat. No se marca el historial como descargado; se reintentará al reiniciar.');
    }
  } catch (error) {
    console.warn('⚠️  Aviso descargando historial:', error?.message || String(error));
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

  // Pin de versión web (opcional). Con strict:false, si no puede cargar la versión fijada
  // cae a la última — nunca deja la app sin arrancar.
  const usePin = WA_WEB_VERSION && !['none', 'latest', ''].includes(WA_WEB_VERSION.toLowerCase());
  if (usePin) {
    console.log(`📌 Fijando WhatsApp Web a la versión ${WA_WEB_VERSION}`);
  } else {
    console.log('📌 Usando la última versión de WhatsApp Web (sin pin)');
  }
  const webVersionOptions = usePin
    ? {
        webVersion: WA_WEB_VERSION,
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
          strict: false,
        },
      }
    : {};

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: authDataPath
    }),
    ...webVersionOptions,
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
    protocolTimeout: 600000  // 10 minutos: scroll-back completo de chats grandes puede tardar
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
      const contact = await msg.getContact().catch(() => null);
      const chat = await msg.getChat().catch(() => null);

      const isStatus = chat?.id?._serialized?.includes('status@broadcast') ?? false;

      // Detectar si es un grupo
      const isGroup = chat?.isGroup ?? false;
      let folderName;
      let sender;

      if (isGroup) {
        // En grupos: usar nombre del grupo
        folderName = chat?.name || msg.from.split('@')[0];
        sender = msg.fromMe ? 'Yo' : contact?.name || msg.from.split('@')[0];
      } else {
        // En chats 1a1: siempre usar el contacto del chat (el "otro"), no el del mensaje
        const chatContact = chat ? await chat.getContact().catch(() => null) : null;
        folderName = chatContact?.name || contact?.name || msg.from.split('@')[0];
        sender = msg.fromMe ? 'Yo' : contact?.name || msg.from.split('@')[0];
      }

      // Limpiar nombre de carpeta
      folderName = folderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

      // Mensajes de sistema de llamadas (contienen duración al finalizar)
      if (msg.type === 'call_log') {
        const callType = msg.body?.toLowerCase().includes('video') ? 'videollamada' : 'llamada';
        const direction = msg.fromMe ? 'saliente' : 'entrante';
        const duration = msg.body || 'duración desconocida';
        const callText = `[${callType.toUpperCase()} ${direction} - ${duration}]`;
        console.log(`📞 Log de llamada en ${folderName}: ${callText}`);
        saveMessage(folderName, 'LLAMADA', callText, msg.timestamp);
        return;
      }

      const text = msg.body || '[Archivo adjunto]';
      const type = isGroup ? '👥' : '💬';

      console.log(`${type} 📝 [${folderName}] ${sender}: ${text.substring(0, 60)}`);
      saveMessage(folderName, sender, text, msg.timestamp);

      // Guardar en carpeta "Yo" todos los mensajes que yo envío
      if (msg.fromMe) {
        saveMessage('Yo', `Yo → ${folderName}`, text, msg.timestamp);
      }

      // Media detection — skip status attachments unless sender is in FULL_HISTORY_CHATS
      if (msg.hasMedia) {
        const senderKey = sender.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
        if (isStatus && !FULL_HISTORY_CHATS.has(senderKey)) {
          // Don't download status media from contacts outside the full-history list
        } else {
          try {
            const media = await downloadMediaWithTimeout(msg);
            if (media) {
              const ext = media.mimetype ? media.mimetype.split('/')[1] : 'bin';
              const filename = media.filename || `${Date.now()}.${ext}`;
              await saveAttachment(folderName, filename, Buffer.from(media.data, 'base64'));
              console.log(`📎 Adjunto guardado en ${folderName}: ${filename}`);
            }
          } catch (e) {
            // El error "r" minificado suele ser media que WhatsApp ya no entrega
            // (media antigua/expirada, común tras re-vincular). El texto ya quedó registrado.
            console.log(`⚠️ Media no disponible en ${folderName} (${msg.type}) — ${e?.message || String(e)}`);
          }
        }
      }
    } catch (e) {
      console.error('Error procesando mensaje:', e?.message || String(e));
    }
  });

  client.on('call', async (call) => {
    try {
      const callType = call.isVideo ? 'videollamada' : 'llamada de voz';
      const direction = call.fromMe ? 'saliente' : 'entrante';
      const contactId = call.from || call.to || 'desconocido';

      let folderName = contactId.split('@')[0];
      try {
        const contact = await client.getContactById(contactId);
        folderName = contact.name || folderName;
      } catch (_) {}
      folderName = folderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

      const label = `[${callType.toUpperCase()} ${direction}]`;
      console.log(`📞 ${label} con ${folderName}`);
      saveMessage(folderName, 'LLAMADA', label, call.timestamp);
    } catch (e) {
      console.error('Error procesando llamada:', e.message);
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
