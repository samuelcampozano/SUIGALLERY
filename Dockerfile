FROM node:24-slim

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source code
COPY server/ ./server/
COPY public/ ./public/
COPY sdk/ ./sdk/
COPY test-connection.js ./

# Ensure storage directory exists
RUN mkdir -p /app/temp_storage

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV CONSOLE_MCP_ALLOWED_DIRS=/app

CMD ["npm", "start"]
