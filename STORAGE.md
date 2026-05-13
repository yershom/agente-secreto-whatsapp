# Almacenamiento Persistente

## Estructura de carpetas

```
conversations/
├── Juan_Pérez/              # Nombre del contacto (limpio y sanitizado)
│   ├── chat.txt            # Historial de mensajes
│   └── attachments/        # Archivos descargados
├── 34612345678/            # Si no hay nombre, usa número
│   ├── chat.txt
│   └── attachments/
└── Grupo_Familia/          # Grupos de chat
    ├── chat.txt
    └── attachments/
```

## Almacenamiento en Docker

Los volúmenes en `docker-compose.yml` usan **bind mounts**, que significan:

### ✅ Datos PERSISTENTES (no se pierden)
```yaml
volumes:
  - ./conversations:/app/conversations   # Host → Container
  - ./auth_info:/app/auth_info
```

**Qué significa:**
- `./conversations` = carpeta en el servidor (host)
- `/app/conversations` = carpeta dentro del contenedor
- Los datos se guardan en `./conversations/` en el **servidor**, no dentro del contenedor
- Si el contenedor se apaga, reinicia, o se elimina: **los datos persisten**

## Backup y Maintenance

### Backup automático (recomendado)
```bash
# Backup diario a las 2 AM
0 2 * * * tar -czf /backup/agente-wa-$(date +\%Y\%m\%d).tar.gz /home/ubuntu/agente-secreto-whatsapp/conversations/
```

### Ver tamaño de almacenamiento
```bash
du -sh conversations/
du -sh conversations/*/
```

### Limpiar adjuntos antiguos (opcional)
```bash
find conversations/*/attachments/ -type f -mtime +30 -delete
```

## Monitoreo

Health check automático en Docker:
```bash
docker compose ps  # Ver estado
docker compose logs agente-wa | grep health
```

## En tu servidor (gedevops.site)

El contenedor corre en:
```
/home/ubuntu/agente-secreto-whatsapp/conversations/
```

Puedes acceder directamente:
```bash
ls -la conversations/
tail -f conversations/*/chat.txt
```

## Recuperación ante problemas

Si necesitas restaurar desde backup:
```bash
# Detener contenedor
docker-compose down

# Restaurar
tar -xzf /backup/agente-wa-20260512.tar.gz -C /

# Reiniciar
docker-compose up -d
```
