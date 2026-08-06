FROM node:20-slim

WORKDIR /app

# Install Chromium and dependencies for Puppeteer (works on ARM64)
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./

# Install Node dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Create directories with correct permissions
RUN mkdir -p conversations auth_info .wwebjs_cache && \
    chmod 777 conversations auth_info .wwebjs_cache

# Create non-root user
RUN useradd -m -u 1001 agente && chown -R agente:agente /app

# Entrypoint fixes bind-mount permissions (auto-created by Docker as root) then drops to agente
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
