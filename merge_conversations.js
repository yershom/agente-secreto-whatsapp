import fs from 'fs';
import path from 'path';

function parseTimestamp(line) {
  const m = line.match(/^\[(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})\]/);
  if (!m) return 0;
  const [, dd, mm, yyyy, hh, min, ss] = m;
  return new Date(+yyyy, +mm - 1, +dd, +hh, +min, +ss).getTime();
}

function mergeChats(targetFile, sourceFile) {
  const lines = new Set();
  if (fs.existsSync(targetFile)) {
    fs.readFileSync(targetFile, 'utf8').split('\n').forEach(l => { if (l.trim()) lines.add(l); });
  }
  fs.readFileSync(sourceFile, 'utf8').split('\n').forEach(l => { if (l.trim()) lines.add(l); });
  const sorted = [...lines].sort((a, b) => parseTimestamp(a) - parseTimestamp(b));
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, sorted.join('\n') + '\n', 'utf8');
}

function mergeConversations(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source not found: ${sourceDir}`);
    process.exit(1);
  }
  let count = 0;
  for (const contact of fs.readdirSync(sourceDir)) {
    const sourceContact = path.join(sourceDir, contact);
    const targetContact = path.join(targetDir, contact);
    const sourceChat = path.join(sourceContact, 'chat.txt');
    const targetChat = path.join(targetContact, 'chat.txt');
    if (fs.statSync(sourceContact).isDirectory() && fs.existsSync(sourceChat)) {
      fs.mkdirSync(path.join(targetContact, 'attachments'), { recursive: true });
      mergeChats(targetChat, sourceChat);
      console.log(`  ✓ ${contact}`);
      count++;
    }
  }
  console.log(`\nTotal: ${count} conversaciones procesadas.`);
}

const [,, sourceDir, targetDir] = process.argv;
if (!sourceDir || !targetDir) {
  console.error('Uso: node merge_conversations.js <carpeta_origen> <carpeta_destino>');
  process.exit(1);
}

console.log(`\nMerging: ${sourceDir} → ${targetDir}\n`);
mergeConversations(sourceDir, targetDir);
console.log('Listo.\n');
