# --- BUILD STAGE ---
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install OpenSSL required by Prisma schema engine
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

# Install build dependencies and app modules
RUN npm ci

COPY . .

# Generate Prisma Client & Build Application
RUN npm run prisma:generate
RUN npm run build

# --- PRODUCTION STAGE ---
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Install OpenSSL required by Prisma at runtime
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production

# Copy built assets
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

ENV NODE_ENV=production

# Run migrations and start app
CMD ["sh", "-c", "npm run prisma:migrate && npm run start:prod"]

