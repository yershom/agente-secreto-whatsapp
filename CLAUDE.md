# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AgenteWA** — WhatsApp conversation logger using Baileys. Registra automáticamente todas las conversaciones de WhatsApp en archivos de texto con timestamp, organizadas por contacto/conversación. Los adjuntos se guardan en una carpeta separada dentro de cada conversación.

**Deployment:** Ubuntu en Oracle Cloud Infrastructure (gedevops.site)

## Setup & Development Commands

### Installation
```bash
npm install
```

Creates `node_modules/` with all dependencies locally (equivalent to Python venv).

### Configuration
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` if needed (default values work for development)

### Running the Application
```bash
npm start
```

- Generates QR code in terminal on first run
- Scan with WhatsApp to authenticate
- Creates `auth_info/` folder with credentials (don't commit)
- Begins logging all incoming and outgoing messages

### Development Mode (auto-reload)
```bash
npm run dev
```

Watches for file changes and restarts automatically.

## Architecture

### Project Structure
```
src/
├── index.js           Main entry point, initializes storage and WhatsApp
├── whatsapp.js        Baileys integration, message event listeners
└── storage.js         File system operations, message/attachment logging

conversations/         Generated folder containing logged conversations
├── [phone_number]/
│   ├── chat.txt       Timestamped message log
│   └── attachments/   Downloaded files (images, documents, etc.)

auth_info/            Generated folder with WhatsApp session credentials (gitignored)
```

### How It Works

1. **Initialization**: `index.js` initializes storage directories and connects to WhatsApp via Baileys
2. **QR Authentication**: On first run, displays QR code for phone authentication
3. **Message Logging**: Each incoming/outgoing message triggers event listener in `whatsapp.js`
4. **Storage**: 
   - Messages saved to `conversations/[phone]/chat.txt` with format: `[HH:MM:SS DD/MM/YYYY] Sender: Message`
   - Attachments detected and logged (download implementation requires media handling)
   - One folder per contact/conversation keeps related files organized

### Key Dependencies
- **@whiskeysockets/baileys** (v6.6.0): WhatsApp Web API client, handles authentication and messaging
- **dotenv** (v16.3.1): Loads environment variables from `.env` file

### Message Flow
```
WhatsApp message arrives → Baileys socket receives event → whatsapp.js handler extracts metadata 
→ saveMessage() appends to contact's chat.txt → attachments downloaded to contact's attachments/ folder
```

### Data Storage Format
Each conversation folder contains:
- `chat.txt` — Plaintext log, one entry per line:
  ```
  [14:23:45 12/05/2026] Juan: Hola, ¿cómo estás?
  [14:24:12 12/05/2026] Yo: Bien, ¿y tú?
  ```
- `attachments/` — Subdirectory with downloaded media (images, PDFs, etc.)

## Development Notes

- **Auth credentials**: The `auth_info/` folder is gitignored—each deployment needs its own QR authentication
- **Attachment handling**: Current implementation logs attachment detection; full media download requires Baileys media processing
- **Contact naming**: Phone numbers are sanitized (special characters removed) to create valid folder names
- **Message text**: Extracts from `conversation`, `extendedTextMessage`, or marks as `[Archivo adjunto]` if no text
- **No framework overhead**: Pure Node.js with minimal dependencies keeps the app lightweight and fast

## Deployment on Ubuntu/Oracle Cloud

Before deploying to `gedevops.site`:
1. Clone repository, run `npm install`
2. Create `.env` file from `.env.example`
3. Run once locally or on server to generate QR and authenticate
4. Set up process manager (PM2, systemd, or similar) to keep app running
5. Ensure `conversations/` directory has write permissions
6. Consider log rotation for large `chat.txt` files

## Related Resources

- [Baileys GitHub](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web API client
- Oracle Cloud documentation for Ubuntu networking/storage
