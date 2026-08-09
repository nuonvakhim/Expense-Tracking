# syntax=docker/dockerfile:1

# ---- build: compile TypeScript with dev dependencies present ----
FROM node:22-alpine AS build
WORKDIR /app
# Copy manifests first so this layer caches until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- deps: production node_modules only, no tsx/typescript ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# The node image ships an unprivileged `node` user — don't run as root.
USER node

EXPOSE 4000

# Uses the API's own health endpoint, which also verifies database reachability.
# Node 22 has global fetch, so this needs no extra packages in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
