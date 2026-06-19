# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Production image for the ipo-ui Next.js 16 app (standalone output).
# Build context must be the ipo-ui/ directory:
#   docker build -t ipo-ui .
# ─────────────────────────────────────────────────────────────────────────────

# 1. Install production + dev deps (needed to build) ──────────────────────────
FROM node:22-alpine AS deps
# Next.js' SWC binary needs glibc compat on Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build the app → .next/standalone ─────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# 3. Minimal runtime image ────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Thailand timezone. node:alpine ships without tzdata, so install it and set TZ
# — otherwise Date/Intl in the app silently fall back to UTC.
RUN apk add --no-cache tzdata
ENV TZ=Asia/Bangkok

# Run as an unprivileged user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone server + its traced node_modules, then the static assets it serves.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# server.js is emitted by `output: "standalone"`.
CMD ["node", "server.js"]
