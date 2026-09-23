#!/usr/bin/env bash
# Deploy production services from the current checkout.
#
#   scripts/prod-deploy.sh backend
#   scripts/prod-deploy.sh frontend backend
#   scripts/prod-deploy.sh --dry-run frontend    # build and check, don't swap
#
# This is the manual procedure from CLAUDE.md in one place, because skipping a
# step there takes the site down:
#   * containers are replaced (stop + rm + fresh up), never recreated —
#     docker-compose 1.29 dies with KeyError: 'ContainerConfig' on a recreate
#     and leaves nginx restart-looping;
#   * the previous image is tagged first, so a rollback is one command;
#   * the frontend bundle is checked for the real API URL (a missing DOMAIN
#     silently bakes in https://localhost/api/v1);
#   * nginx is restarted afterwards so it picks up the new container's address.
#
# Annotators keep their work during the swap: the editor retries saves that
# fail while the backend is down and keeps a copy in the browser meanwhile.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE=docker-compose.prod.yml
DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  shift
fi

SERVICES=("$@")
if [ ${#SERVICES[@]} -eq 0 ]; then
  echo "Usage: scripts/prod-deploy.sh [--dry-run] <frontend|backend|nginx> ..." >&2
  exit 1
fi

grep -q '^DOMAIN=' .env || {
  echo "DOMAIN is missing from .env — the build would bake in localhost." >&2
  exit 1
}
DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)
STAMP=$(date +%Y%m%d-%H%M%S)

echo "==> Building: ${SERVICES[*]}"
docker-compose -f "$COMPOSE_FILE" build "${SERVICES[@]}"

if printf '%s\n' "${SERVICES[@]}" | grep -qx frontend; then
  baked=$(docker run --rm --entrypoint sh bsmarker/frontend:latest -c \
    'grep -oh "https://[a-z.]*/api/v1" /usr/share/nginx/html/static/js/main.*.js | sort -u')
  echo "==> Baked API URL: ${baked:-(none)}"
  [ "$baked" = "https://$DOMAIN/api/v1" ] || {
    echo "Wrong API URL in the bundle — expected https://$DOMAIN/api/v1." >&2
    exit 1
  }
fi

if [ "$DRY_RUN" = true ]; then
  echo "==> Dry run: images built and checked, nothing swapped."
  exit 0
fi

for svc in "${SERVICES[@]}"; do
  container="bsmarker_${svc}_1"
  echo "==> Deploying $svc"
  if docker inspect "$container" >/dev/null 2>&1; then
    docker tag "$(docker inspect -f '{{.Image}}' "$container")" "bsmarker/${svc}:rollback-${STAMP}"
    echo "    rollback image: bsmarker/${svc}:rollback-${STAMP}"
    docker stop "$container" >/dev/null
    docker rm "$container" >/dev/null
  fi
  docker-compose -f "$COMPOSE_FILE" up -d --no-deps "$svc"

  for _ in $(seq 1 45); do
    state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$container" 2>/dev/null || echo missing)
    [ "$state" = healthy ] && break
    sleep 2
  done
  echo "    $svc: $state"
  [ "$state" = healthy ] || {
    echo "$svc did not become healthy. Roll back with:" >&2
    echo "  docker stop $container && docker rm $container" >&2
    echo "  docker tag bsmarker/${svc}:rollback-${STAMP} bsmarker/${svc}:latest" >&2
    echo "  docker-compose -f $COMPOSE_FILE up -d --no-deps $svc" >&2
    exit 1
  }
done

echo "==> Restarting nginx"
docker restart bsmarker_nginx_1 >/dev/null
for _ in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' bsmarker_nginx_1)" = healthy ] && break
  sleep 2
done

echo "==> Checking the site"
code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/")
api=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/v1/projects/")
echo "    https://$DOMAIN/ -> $code, API (unauthenticated) -> $api"
[ "$code" = "200" ] && [ "$api" = "401" ] || {
  echo "The site is not answering as expected — check the logs." >&2
  exit 1
}
echo "==> Done. Rollback images tagged with rollback-${STAMP}."
