# ── Backend (NestJS) ──────────────────────────────────────────────────────────
# Build context must be the WORKSPACE ROOT (docker-compose sets context: .)
# so that Nx can resolve shared/ imports during the build.

FROM node:20-alpine AS builder
WORKDIR /app
ENV NX_DAEMON=false

# 1. Copy lockfile + package.json first (layer caching)
COPY package.json package-lock.json ./

# 2. Install ALL deps (devDeps needed for the Nx/webpack build)
RUN npm ci

# 3. Copy the entire monorepo source
COPY . .

# 4. Build the backend via Nx (output → dist/backend/)
#    This also generates a standalone package.json inside dist/backend/
RUN npx nx build backend --configuration=production

# ── Production runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /usr/src/app

# Copy the built output (includes generated package.json)
COPY --from=builder /app/dist/backend ./

# Install only production dependencies from the generated package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "main.js"]
