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

# Create non-root user (use 1001 to avoid conflicts with base image)
RUN useradd -m -u 1001 agente && chown -R agente:agente /app
USER agente

# Start application
CMD ["npm", "start"]
