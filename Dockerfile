# ============================================
# Stage 1: Builder - Build TypeScript application
# ============================================
FROM node:22-alpine AS builder

# Declare build arguments (to suppress warnings - these are runtime env vars)
# CapRover passes these as build-args, but we don't need them at build time
ARG DATABASE_URL
ARG JWT_SECRET
ARG WA_ACCESS_TOKEN
ARG WA_PHONE_NUMBER_ID
ARG WA_BUSINESS_ACCOUNT_ID
ARG PORT
ARG NODE_ENV
ARG FRONTEND_URL
ARG BILLPLZ_API_KEY
ARG BILLPLZ_BASE_URL
ARG BILLPLZ_COLLECTION_ID
ARG BILLPLZ_WEBHOOK_URL
ARG BILLPLZ_X_SIGNATURE
ARG PRISMA_LOG_QUERIES
ARG AUTH_SECRET
ARG API_BASE_URL
ARG CAPROVER_GIT_COMMIT_SHA
ARG RESEND_API_KEY
ARG RESEND_FROM_EMAIL

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
# This is required for TypeScript compilation
# Force NODE_ENV to be empty to ensure devDependencies are installed
RUN NODE_ENV= npm ci

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Copy application source code
COPY . .

# Build TypeScript to JavaScript
# This must happen in builder stage where devDependencies are available
# Use build:force to ensure we always build (not skip if dist exists)
RUN npm run build:force

# Verify build output exists
RUN test -d dist && test -f dist/server.js || (echo "Build failed - dist/server.js not found" && exit 1)

# ============================================
# Stage 2: Production - Runtime image
# ============================================
FROM node:22-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
# NOTE: Do NOT install devDependencies here - build already happened in builder stage
RUN npm ci --only=production

# Copy Prisma schema for runtime
COPY prisma ./prisma

# Generate Prisma Client in production image (needs @prisma/client from production deps)
RUN npx prisma generate

# Copy built application from builder stage
# The TypeScript compilation already happened in builder stage with all devDependencies
COPY --from=builder /app/dist ./dist

# Copy generated Prisma client (needed at runtime)
COPY --from=builder /app/app/generated ./app/generated

# Copy geo data file needed at runtime (compiled code looks for dist/lib/my-geo-data.json)
COPY --from=builder /app/src/lib/my-geo-data.json ./dist/lib/my-geo-data.json

# Verify the build artifacts are present (from builder stage)
RUN test -d dist && test -f dist/server.js || (echo "ERROR: Build artifacts missing from builder stage" && exit 1)

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (CapRover will use PORT env variable)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application using the built JavaScript
CMD ["node", "dist/server.js"]
