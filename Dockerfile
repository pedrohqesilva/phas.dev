# Build the site, then run one Node server for the static files and the game WebSocket.
# Node 24 runs the server's TypeScript directly (type stripping), so there is no server build step.
FROM node:24-slim AS build
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . ./
RUN pnpm build && pnpm prune --prod

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
# The server shares the game rules and protocol with the browser: the whole folder, so a new shared file
# can never be left out.
COPY --from=build /app/src/games ./src/games
USER node
CMD ["node", "server/index.ts"]
