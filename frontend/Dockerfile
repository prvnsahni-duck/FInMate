# ── Frontend (Angular 21) ─────────────────────────────────────────────────────
# Build context must be the WORKSPACE ROOT (docker-compose sets context: .)
# so that Nx can resolve shared/ imports during the build.

FROM node:20-alpine AS builder
WORKDIR /app
ENV NX_DAEMON=false

# 1. Copy lockfile + package.json first (better layer caching)
COPY package.json package-lock.json ./

# 2. Install ALL deps (devDeps are needed for the Angular build)
RUN npm ci

# 3. Copy the entire monorepo source
COPY . .

# 4. Build the Angular frontend via Nx (output → dist/frontend/browser)
RUN npx nx build frontend --configuration=production

# ── Nginx runtime ─────────────────────────────────────────────────────────────
FROM nginx:stable-alpine

# Copy custom nginx config that handles SPA routing
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template

# Copy the built Angular app (browser sub-folder contains index.html + assets)
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
