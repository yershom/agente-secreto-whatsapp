#!/bin/sh
chown -R agente:agente /app/conversations /app/auth_info /app/.wwebjs_cache 2>/dev/null || true
exec su -s /bin/sh -c "npm start" agente
