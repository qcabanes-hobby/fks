FROM node:20-slim AS builder
WORKDIR /app

RUN rm -f /etc/apt/apt.conf.d/docker-clean \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build

RUN npm prune --omit=dev

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN rm -f /etc/apt/apt.conf.d/docker-clean \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/main.js"]
