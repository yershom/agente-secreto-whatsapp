import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { initializeStorage } from './storage.js';
import { startWhatsApp } from './whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', 'logs');
fs.mkdirSync(LOGS_DIR, { recursive: true });
const logStream = fs.createWriteStream(path.join(LOGS_DIR, 'app.log'), { flags: 'a' });

const _stdoutWrite = process.stdout.write.bind(process.stdout);
const _stderrWrite = process.stderr.write.bind(process.stderr);
process.stdout.write = (chunk, enc, cb) => { logStream.write(chunk); return _stdoutWrite(chunk, enc, cb); };
process.stderr.write = (chunk, enc, cb) => { logStream.write(chunk); return _stderrWrite(chunk, enc, cb); };

const PORT = process.env.PORT || 3000;

async function main() {
  console.log('🚀 Iniciando AgenteWA con wa-web.js...');

  initializeStorage();
  console.log('✓ Almacenamiento inicializado');

  // Servidor HTTP simple para health checks
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        app: 'AgenteWA',
        version: '1.0.0',
        status: 'running',
        description: 'WhatsApp conversation logger (wa-web.js)'
      }));
    }
  });

  server.listen(PORT, () => {
    console.log(`✓ Servidor HTTP escuchando en puerto ${PORT}`);
  });

  try {
    await startWhatsApp();
  } catch (error) {
    console.error('Error en WhatsApp:', error);
    process.exit(1);
  }
}

main();
