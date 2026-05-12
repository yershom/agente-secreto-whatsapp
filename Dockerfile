FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Create directories for runtime data
RUN mkdir -p conversations auth_info

# Create non-root user
RUN useradd -m -u 1000 agente && chown -R agente:agente /app
USER agente

# Start application
CMD ["npm", "start"]
