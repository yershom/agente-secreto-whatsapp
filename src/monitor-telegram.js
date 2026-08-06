import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERSATIONS_DIR = path.join(__dirname, '..', 'conversations');

const DEFAULT_CHAT_DIRS = [
  'Psic_logo_Aras',
  'Candy',
  'Ibrahim_Gatito_WS',
  'Karem',
  'Nora_Olivas',
  '_52_734_141_1968',
];
const KEYWORD_RE = /.+/;
const POLL_MS = Number(process.env.MONITOR_POLL_MS || 2000);

/** @type {Map<string, { position: number, partialLine: string }>} */
const fileState = new Map();

function resolveChatFiles() {
  if (process.env.MONITOR_CHAT_FILES) {
    return process.env.MONITOR_CHAT_FILES.split(',')
      .map((p) => path.resolve(p.trim()))
      .filter(Boolean);
  }
  if (process.env.MONITOR_CHAT_FILE) {
    return [path.resolve(process.env.MONITOR_CHAT_FILE)];
  }
  return DEFAULT_CHAT_DIRS.map((dir) =>
    path.join(CONVERSATIONS_DIR, dir, 'chat.txt')
  );
}

function chatLabel(chatFile) {
  return path.basename(path.dirname(chatFile));
}

function getState(chatFile) {
  if (!fileState.has(chatFile)) {
    const position = fs.existsSync(chatFile) ? fs.statSync(chatFile).size : 0;
    fileState.set(chatFile, { position, partialLine: '' });
  }
  return fileState.get(chatFile);
}

function requireTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  const missing = [];
  if (!token) missing.push('TELEGRAM_BOT_TOKEN');
  if (!chatId) missing.push('TELEGRAM_CHAT_ID');
  if (missing.length) {
    console.error(`Falta en .env: ${missing.join(', ')}`);
    if (!chatId && token) {
      console.error(
        'Tienes el token. Siguiente paso:\n' +
          '  1. Abre tu bot en Telegram y envíale un mensaje (ej: hola)\n' +
          '  2. Ejecuta: npm run telegram:chat-id\n' +
          '  3. Copia TELEGRAM_CHAT_ID=... al archivo .env'
      );
    }
    process.exit(1);
  }
  return { token, chatId };
}

async function sendTelegram(text) {
  const { token, chatId } = requireTelegramConfig();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json();
  if (!body.ok) {
    throw new Error(body.description || `HTTP ${res.status}`);
  }
  return body;
}

function processLines(chatFile, text) {
  const state = getState(chatFile);
  const combined = state.partialLine + text;
  const parts = combined.split('\n');
  state.partialLine = parts.pop() ?? '';

  for (const line of parts) {
    if (!line.trim()) continue;
    if (KEYWORD_RE.test(line)) {
      notifyLine(chatFile, line).catch((err) =>
        console.error(`[telegram:${chatLabel(chatFile)}]`, err.message)
      );
    }
  }
}

async function notifyLine(chatFile, line) {
  const label = chatLabel(chatFile);
  const msg = `🔔 ${label}/chat.txt\n\n${line}`;
  console.log(`[match:${label}]`, line.slice(0, 120));
  await sendTelegram(msg);
}

function readNewBytes(chatFile) {
  if (!fs.existsSync(chatFile)) {
    console.error(`[monitor] No existe: ${chatFile}`);
    return;
  }

  const state = getState(chatFile);
  const stat = fs.statSync(chatFile);
  const label = chatLabel(chatFile);

  if (stat.size < state.position) {
    console.log(`[monitor:${label}] Archivo reiniciado/truncado, releo desde el inicio`);
    state.position = 0;
    state.partialLine = '';
  }

  if (stat.size <= state.position) return;

  const fd = fs.openSync(chatFile, 'r');
  const len = stat.size - state.position;
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, state.position);
  fs.closeSync(fd);
  state.position = stat.size;
  processLines(chatFile, buf.toString('utf8'));
}

function readAll() {
  for (const chatFile of resolveChatFiles()) {
    try {
      readNewBytes(chatFile);
    } catch (err) {
      console.error(`[read:${chatLabel(chatFile)}]`, err.message);
    }
  }
}

function watchChat(chatFile) {
  if (!fs.existsSync(chatFile)) {
    console.warn(`[monitor] Omitiendo (no existe): ${chatFile}`);
    return;
  }
  getState(chatFile);
  fs.watch(chatFile, { persistent: true }, () => readNewBytes(chatFile));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    await sendTelegram('✅ Monitor AgenteWA: prueba de Telegram OK');
    console.log('Mensaje de prueba enviado.');
    return;
  }

  requireTelegramConfig();

  const chatFiles = resolveChatFiles();
  const existing = chatFiles.filter((f) => fs.existsSync(f));
  if (existing.length === 0) {
    console.error('Ningún chat.txt encontrado:', chatFiles.join(', '));
    process.exit(1);
  }

  console.log('[monitor] Vigilando:');
  for (const chatFile of existing) {
    const state = getState(chatFile);
    console.log(`  - ${chatFile} (desde byte ${state.position})`);
    watchChat(chatFile);
  }
  console.log('[monitor] Notificando cada línea nueva (sin filtro de palabras clave)');
  console.log('[monitor] Solo líneas nuevas desde ahora');

  setInterval(readAll, POLL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
