# Static web client served by Caddy (TLS + HTTP/2). Runtime game assets are
# built separately (`pnpm assets:build`) because third-party art is not in git.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @rpg/game-web build

FROM caddy:2-alpine
COPY --from=build /repo/apps/game-web/dist /srv/web
COPY infra/deploy/Caddyfile /etc/caddy/Caddyfile
