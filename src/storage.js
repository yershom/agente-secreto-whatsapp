import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERSATIONS_DIR = path.join(__dirname, '..', 'conversations');

export function initializeStorage() {
  if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
  }
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
}

export function saveMessage(contact, sender, message) {
  const contactDir = path.join(CONVERSATIONS_DIR, sanitizeName(contact));
  const chatFile = path.join(contactDir, 'chat.txt');

  if (!fs.existsSync(contactDir)) {
    fs.mkdirSync(contactDir, { recursive: true });
    fs.mkdirSync(path.join(contactDir, 'attachments'), { recursive: true });
  }

  const timestamp = new Date().toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const logLine = `[${timestamp}] ${sender}: ${message}\n`;
  fs.appendFileSync(chatFile, logLine, 'utf8');
}

export function backupChat(contact) {
  const dir = path.join(CONVERSATIONS_DIR, sanitizeName(contact));
  const chatFile = path.join(dir, 'chat.txt');
  if (fs.existsSync(chatFile)) {
    fs.copyFileSync(chatFile, path.join(dir, 'chat.bak.txt'));
  }
}

function parseTimestamp(line) {
  const m = line.match(/^\[(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})\]/);
  if (!m) return 0;
  const [, dd, mm, yyyy, hh, min, ss] = m;
  return new Date(+yyyy, +mm - 1, +dd, +hh, +min, +ss).getTime();
}

export function deduplicateChat(contact) {
  const chatFile = path.join(CONVERSATIONS_DIR, sanitizeName(contact), 'chat.txt');
  if (!fs.existsSync(chatFile)) return;
  const lines = [...new Set(
    fs.readFileSync(chatFile, 'utf8').split('\n').filter(l => l.trim())
  )];
  lines.sort((a, b) => parseTimestamp(a) - parseTimestamp(b));
  fs.writeFileSync(chatFile, lines.join('\n') + '\n', 'utf8');
}

export function saveAttachment(contact, filename, buffer) {
  const contactDir = path.join(CONVERSATIONS_DIR, sanitizeName(contact));
  const attachmentsDir = path.join(contactDir, 'attachments');

  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  const filepath = path.join(attachmentsDir, filename);
  if (fs.existsSync(filepath)) return filepath;
  fs.writeFileSync(filepath, buffer);
  return filepath;
}
