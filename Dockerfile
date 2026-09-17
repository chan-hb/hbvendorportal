# Only needed for Azure Container Apps or Container Instances.
# App Service deployments use the GitHub Actions workflow instead and ignore this.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
# openssl is required by the Prisma query engine on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app ./
RUN npm prune --omit=dev
EXPOSE 8080
ENV PORT=8080
CMD ["node", "scripts/start.mjs"]
