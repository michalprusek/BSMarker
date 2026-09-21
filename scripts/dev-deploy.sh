#!/usr/bin/env bash
# Build and (re)start the DEV stack from the current working tree.
#
#   scripts/dev-deploy.sh                 # backend + frontend
#   scripts/dev-deploy.sh frontend        # just one service
#
# Production is never touched: different compose project, different volumes,
# different containers. Only the shared nginx routes /dev/ to them.
#
# Containers are replaced (stop + rm + fresh up) instead of recreated, because
# docker-compose 1.29 on this server dies with KeyError: 'ContainerConfig' when
# it recreates an existing container.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=bsmarker_dev
ENV_FILE=.env.dev
[ -f "$ENV_FILE" ] || {
  echo "Missing $ENV_FILE. Copy .env.dev.example and fill in the secrets." >&2
  exit 1
}
COMPOSE=(docker-compose -f docker-compose.dev-server.yml --env-file "$ENV_FILE" -p "$PROJECT")

SERVICES=("$@")
[ ${#SERVICES[@]} -eq 0 ] && SERVICES=(dev-backend dev-frontend)

# Data services: start if missing, never recreate (they hold the DEV data).
"${COMPOSE[@]}" up -d --no-recreate dev-postgres dev-redis dev-minio

"${COMPOSE[@]}" build "${SERVICES[@]}"

# The API URL is baked into the bundle at build time; without DOMAIN it silently
# becomes https://localhost/dev/api/v1 and nothing in the browser works.
if printf '%s\n' "${SERVICES[@]}" | grep -qx dev-frontend; then
  baked=$(docker run --rm --entrypoint sh bsmarker/frontend:dev -c \
    'grep -oh "https://[a-z.]*/dev/api/v1" /usr/share/nginx/html/static/js/main.*.js | sort -u')
  echo "baked API URL: $baked"
  case "$baked" in
    *localhost*|"") echo "Wrong API URL baked in — is DOMAIN set in $ENV_FILE?" >&2; exit 1 ;;
  esac
fi

for svc in "${SERVICES[@]}"; do
  container="bsmarker_${svc//-/_}"
  if docker inspect "$container" >/dev/null 2>&1; then
    image=$(docker inspect -f '{{.Image}}' "$container")
    docker tag "$image" "bsmarker/${svc#dev-}:dev-rollback-$(date +%Y%m%d-%H%M%S)"
    docker stop "$container" >/dev/null
    docker rm "$container" >/dev/null
  fi
  "${COMPOSE[@]}" up -d --no-deps "$svc"
done

# nginx resolves dev-backend / dev-frontend per request, so it needs no restart.
for svc in "${SERVICES[@]}"; do
  container="bsmarker_${svc//-/_}"
  for _ in $(seq 1 30); do
    state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo missing)
    [ "$state" = healthy ] || [ "$state" = running ] && break
    sleep 2
  done
  echo "$svc: $state"
done

echo "DEV is at https://${DOMAIN:-bsmarker.utia.cas.cz}/dev/"
