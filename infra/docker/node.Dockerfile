# Shared image for api-server and game-server (TypeScript run with tsx; no build step).
# Build from the repo root:  docker build -f infra/docker/node.Dockerfile --build-arg APP=game-server .
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api-server/package.json apps/api-server/
COPY apps/game-server/package.json apps/game-server/
COPY packages ./packages-manifests
RUN find packages-manifests -name package.json -not -path "*/node_modules/*" | while read f; do \
      d="packages/$(dirname "${f#packages-manifests/}")"; mkdir -p "$d"; cp "$f" "$d/"; done && rm -rf packages-manifests
RUN pnpm install --frozen-lockfile --filter "@rpg/api-server..." --filter "@rpg/game-server..."

FROM base AS runtime
ARG APP
ENV NODE_ENV=production APP=${APP}
COPY --from=deps /repo /repo
COPY packages ./packages
COPY apps/${APP} ./apps/${APP}
COPY game-data ./game-data
RUN useradd --system --uid 10001 game && chown -R game /repo
USER game
CMD ["sh", "-c", "pnpm --filter @rpg/${APP} start"]
