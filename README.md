# AgenteWA

WhatsApp conversation logger using whatsapp-web.js. Automatically logs all WhatsApp messages with timestamps, organized by contact.

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

## Registrar un segundo teléfono (`conversations_phone2`)

La app corre **un teléfono a la vez**. La carpeta de conversaciones y la de sesión se controlan con variables de entorno en `.env`, y el `docker-compose.yml` las mapea a los volúmenes del contenedor. Así puedes cambiar de teléfono sin tocar código.

| Variable | Teléfono 1 (default) | Teléfono 2 |
|----------|----------------------|------------|
| `CONVERSATIONS_DIR` | `./conversations` | `./conversations_phone2` |
| `AUTH_DIR` | `./auth_info` | `./auth_info_phone2` |

### Cambiar al teléfono 2

1. Edita `.env` en el servidor:
   ```
   CONVERSATIONS_DIR=./conversations_phone2
   AUTH_DIR=./auth_info_phone2
   ```
2. Levanta el contenedor:
   ```bash
   docker-compose up -d
   docker-compose logs -f agente-wa
   ```
3. Escanea el **código QR** que aparece en los logs con el teléfono 2.

Para volver al teléfono 1, quita esas dos líneas del `.env` (o ponlas a `./conversations` y `./auth_info`) y reinicia.

### Empezar el teléfono 2 desde cero (nuevo QR + historial limpio)

```bash
docker-compose down
sudo rm -rf auth_info_phone2/*                                    # borra la sesión → fuerza nuevo QR
sudo rm -rf .wwebjs_cache/*                                       # borra el caché de WhatsApp Web
find conversations_phone2 -mindepth 1 ! -name '.gitkeep' -delete # borra conversaciones y el flag de historial
docker-compose up -d
docker-compose logs -f agente-wa
```

### Descarga del historial completo

En el **primer arranque** con una sesión nueva, la app descarga el historial de **todos** los chats (individuales `@lid`, grupos `@g.us`, etc.) y escribe el flag `conversations_phone2/.history_downloaded` al terminar. Mientras ese flag exista, no vuelve a descargar historial.

> **Importante — sincronización:** al vincular un teléfono nuevo, WhatsApp tarda en empujar el historial completo al dispositivo. Justo tras escanear el QR verás pocos mensajes por chat (~15). Deja el contenedor corriendo y el teléfono conectado **20-30 min o más** para que sincronice; luego fuerza una nueva descarga borrando el flag y reiniciando:
> ```bash
> rm conversations_phone2/.history_downloaded
> docker-compose restart agente-wa
> docker-compose logs -f agente-wa
> ```
> Repite las veces que haga falta: `deduplicateChat()` evita duplicados. Sabrás que ya sincronizó cuando los logs muestren cientos/miles de mensajes por chat en lugar de ~15.

### Qué se registra

- Mensajes de texto, entrantes y salientes, con timestamp (zona horaria `America/Mexico_City`).
- Adjuntos (imágenes, audios, documentos) en `attachments/` de cada conversación.
- **Llamadas de WhatsApp:** el timbre entrante/saliente (`[LLAMADA DE VOZ ENTRANTE]`, `[VIDEOLLAMADA SALIENTE]`) y el registro al finalizar con duración (`[LLAMADA ENTRANTE - 5:23]`), guardados con remitente `LLAMADA`.
- Todos los mensajes que envías se duplican en la carpeta `Yo/`.

## Note

The `auth_info/` folder contains WhatsApp session credentials and is not committed to git. Each deployment needs its own QR authentication.
