# ---- STAGE 1: BUILDER ----
FROM node:20-alpine AS builder

WORKDIR /app

# Instala todas as dependencias (incluindo dev) para gerar o build
COPY package*.json ./
RUN npm ci --include=dev

# Copia o restante do projeto
COPY . .
COPY next.config.ts ./

# Build do Next.js
RUN npm run build

# Remove dependencias de desenvolvimento antes de copiar para o runner
RUN npm prune --omit=dev

# ---- STAGE 2: RUNNER ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copia apenas os artefatos necessarios para rodar
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3022

CMD ["npm", "start"]

