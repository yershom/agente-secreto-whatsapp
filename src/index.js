import 'dotenv/config';
import { initializeStorage } from './storage.js';
import { startWhatsApp } from './whatsapp.js';

async function main() {
  console.log('🚀 Iniciando AgenteWA...');

  initializeStorage();
  console.log('✓ Almacenamiento inicializado');

  try {
    await startWhatsApp();
  } catch (error) {
    console.error('Error en WhatsApp:', error);
    process.exit(1);
  }
}

main();
