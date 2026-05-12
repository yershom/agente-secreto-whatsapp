# AgenteWA

WhatsApp conversation logger using Baileys. Automatically logs all WhatsApp messages with timestamps, organized by contact.

## Quick Start

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Run
npm start
```

Scan the QR code with your WhatsApp phone to authenticate. Messages will be logged to `conversations/` folder.

## Features

- 📱 Logs all WhatsApp messages with exact timestamps
- 📁 Organizes conversations by contact (one folder per user)
- 📎 Detects and stores attachment metadata
- 🔄 Auto-reconnects on disconnection
- 💾 Pure text files (no database required)

## Structure

Each contact gets its own folder:
```
conversations/
├── 34612345678/         (Phone number or contact ID)
│   ├── chat.txt         (Message log with timestamps)
│   └── attachments/     (Downloaded files)
```

## Development

```bash
npm run dev    # Auto-reload on file changes
```

## Docker

**Build and run with Docker Compose:**
```bash
docker-compose up --build
```

Automatically sets up the Node.js app + Caddy reverse proxy with HTTPS.

## Deployment

See `CLAUDE.md` for detailed deployment instructions to Ubuntu/Oracle Cloud with Docker.

## Note

The `auth_info/` folder contains WhatsApp session credentials and is not committed to git. Each deployment needs its own QR authentication.
