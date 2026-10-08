# Build with Node (glibc image: TypeScript 7's native compiler doesn't target musl), serve with Caddy.
FROM node:22-slim AS build
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . ./
RUN pnpm build

FROM caddy:2-alpine
WORKDIR /app
COPY Caddyfile ./
RUN caddy fmt Caddyfile --overwrite
COPY --from=build /app/dist ./dist
CMD ["caddy", "run", "--config", "Caddyfile", "--adapter", "caddyfile"]
