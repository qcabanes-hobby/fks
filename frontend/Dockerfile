FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM alpine:3.20
COPY --from=builder /app/dist /src
CMD ["sh", "-c", "rm -rf /dist/* /dist/.[!.]* 2>/dev/null; cp -a /src/. /dist/ && echo 'Published frontend → /dist'"]
