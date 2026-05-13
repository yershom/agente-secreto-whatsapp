import 'dotenv/config';
import http from 'http';
import { initializeStorage } from './storage.js';
import { startWhatsApp } from './whatsapp.js';

const PORT = process.env.PORT || 3000;

async function main() {
  console.log('🚀 Iniciando AgenteWA...');

  initializeStorage();
  console.log('✓ Almacenamiento inicializado');

  // Servidor HTTP simple para health checks y Caddy reverse proxy
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
        description: 'WhatsApp conversation logger'
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
