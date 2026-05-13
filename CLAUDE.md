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

## Troubleshooting

### Connection Issues (Error 405, Connection Failures)
Baileys may reject connections from certain IPs/locations. This is common in development.

**Solutions:**
1. **Test on production server** (recommended) — Oracle Cloud IPs have better WhatsApp acceptance
2. **Try from different network** — Home internet vs corporate/VPN may have different results
3. **Wait and retry** — WhatsApp sometimes blocks IPs temporarily
4. **Check auth_info folder** — If it exists, delete it to force a fresh QR:
   ```bash
   rm -rf auth_info/
   npm start
   ```

The app will **reliably work** once authenticated, even if initial connection is difficult.

## Deployment on Ubuntu/Oracle Cloud with Docker

### Architecture

AgenteWA runs as a **Node.js container on port 3000** and is proxied by your existing **Caddy reverse proxy** on the host. This maintains your server security configuration (fail2ban, UFW, headers, etc.).

```
Internet (HTTPS) → Caddy (host:80,443) → Docker (localhost:3000)
```

### Docker Setup

**Build and run:**
```bash
docker-compose up -d --build
```

**View logs:**
```bash
docker-compose logs -f agente-wa
```

**Stop:**
```bash
docker-compose down
```

### Deployment Steps

1. **Clone and configure:**
   ```bash
   git clone https://github.com/yershom/agente-secreto-whatsapp.git
   cd agente-secreto-whatsapp
   cp .env.example .env
   ```

2. **Start container:**
   ```bash
   docker-compose up -d
   ```

3. **Configure Caddy** (on host, not in Docker):
   - Edit your Caddyfile: `/etc/caddy/Caddyfile`
   - Add this block to your `gedevops.site` section:
     ```caddy
     handle /wa* {
         reverse_proxy localhost:3000
     }
     ```
   - Reload Caddy: `sudo systemctl reload caddy`
   - See `CADDY_CONFIG.txt` for complete example

4. **First authentication:**
   - Check logs: `docker logs agente-wa`
   - Look for QR code in output
   - Scan QR with phone to authenticate
   - Credentials saved to `auth_info/` (persistent volume)

5. **Verify:**
   - Health check: `curl https://gedevops.site/wa/health`
   - Check logs: `docker logs -f agente-wa`
   - Conversations saved in: `./conversations/`

### Production Considerations

- **Security**: Node runs in unprivileged container (UID 1001), no direct port exposure
- **Volumes**: `conversations/` and `auth_info/` persist between restarts (host filesystem)
- **HTTPS**: Handled by your existing Caddy (auto-renewal, headers, etc.)
- **Firewall**: UFW rules unchanged (only 22, 443 exposed)
- **fail2ban**: Continues protecting with your existing rules
- **Logs**: Available via `docker logs` and Caddy logs
- **Updates**: `git pull` → `docker-compose up --build -d`
- **Backup**: Regular backups of `./conversations/` folder recommended

### Files

- `Dockerfile` — Builds Node.js app (no Caddy, no ports exposed)
- `docker-compose.yml` — Node.js service only (port 3000 for Caddy proxy)
- `CADDY_CONFIG.txt` — Example configuration to add to your Caddyfile
- `.dockerignore` — Excludes non-essential files from build

## Related Resources

- [Baileys GitHub](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web API client
- [Docker Compose](https://docs.docker.com/compose/) — Container orchestration
- [Caddy](https://caddyserver.com/) — Reverse proxy with auto HTTPS
- Oracle Cloud documentation for Ubuntu networking/storage
