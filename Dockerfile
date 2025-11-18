# ---- STAGE 1: BUILDER ----
    FROM node:20-alpine AS builder

    WORKDIR /app
    
    # Copia configs e instala dependências
    COPY package*.json ./
    RUN npm install
    
    # Copia o restante do projeto
    COPY . .
    COPY next.config.ts ./
        
    # Build do Next.js
    RUN npm run build
    
    # ---- STAGE 2: RUNNER ----
    FROM node:20-alpine AS runner
    
    WORKDIR /app
    
    ENV NODE_ENV=production
    
    # Copia apenas os artefatos necessários para rodar
    COPY --from=builder /app/package*.json ./
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/.next ./.next
    COPY --from=builder /app/public ./public
    COPY --from=builder /app/next.config.ts ./next.config.ts
    

    EXPOSE 3022
    
    CMD ["npm", "start"]
    