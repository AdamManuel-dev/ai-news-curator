# Multi-stage Dockerfile for production
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create health check script
RUN echo '#!/bin/sh\nnode -e "require(\"http\").get(\"http://localhost:3000/health\", (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on(\"error\", () => process.exit(1))"' > /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh

# Change ownership to non-root user
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ./healthcheck.sh

# Start the application
CMD ["node", "dist/index.js"]