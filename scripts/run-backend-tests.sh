#!/usr/bin/env bash
# Run the backend test suite against throwaway PostgreSQL, Redis and MinIO containers,
# using the production backend image (so the dependencies match production).
# Nothing touches the production database. Usage: scripts/run-backend-tests.sh [pytest args]
set -euo pipefail
cd "$(dirname "$0")/.."

NET=bsmarker-test-$$
cleanup() { docker rm -f "$NET-pg" "$NET-redis" "$NET-minio" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
WORK=$(mktemp -d)
trap cleanup EXIT

docker network create "$NET" >/dev/null
docker run -d --name "$NET-pg" --network "$NET" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bsmarker_test postgres:14-alpine >/dev/null
docker run -d --name "$NET-redis" --network "$NET" redis:7-alpine >/dev/null
docker run -d --name "$NET-minio" --network "$NET" -e MINIO_ROOT_USER=test-access-key \
  -e MINIO_ROOT_PASSWORD=test-secret-key-minio minio/minio:latest server /data >/dev/null
until docker exec "$NET-pg" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2  # MinIO needs a moment to accept connections

# Copy the backend without secrets (.env) so the container can read it.
tar --exclude=.env --exclude=venv --exclude=__pycache__ --exclude=.mypy_cache -C backend -cf - . | tar -xf - -C "$WORK"
chmod -R a+rX "$WORK"

TEST_DATABASE_URL="postgresql://postgres:postgres@$NET-pg:5432/bsmarker_test"  # pragma: allowlist secret
docker run --rm --network "$NET" -v "$WORK":/app -w /app \
  -e DATABASE_URL="$TEST_DATABASE_URL" \
  -e REDIS_URL="redis://$NET-redis:6379/1" \
  -e MINIO_ENDPOINT="$NET-minio:9000" \
  --entrypoint python bsmarker/backend:latest -m pytest -p no:cacheprovider "$@"
