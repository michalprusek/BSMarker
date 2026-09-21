#!/usr/bin/env bash
# Copy production data into the DEV stack: database, audio files, and then
# reset every DEV password to DEV_USER_PASSWORD from .env.dev.
#
#   scripts/dev-seed.sh            # database + audio
#   scripts/dev-seed.sh --db-only  # database only (audio is the slow part)
#
# Production is only ever READ here (pg_dump, a read-only volume mount).
# Everything written goes to the DEV volumes.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=bsmarker_dev
ENV_FILE=.env.dev
set -a; . ./.env; . "./$ENV_FILE"; set +a

DB_ONLY=${1:-}
DEV_PG=bsmarker_dev_postgres
DEV_BACKEND=bsmarker_dev_backend

echo "==> Stopping the DEV backend while the data is replaced"
docker stop "$DEV_BACKEND" >/dev/null 2>&1 || true

echo "==> Copying the production database (read-only dump)"
# Separate -c switches: DROP/CREATE DATABASE can't run inside a transaction block.
docker exec "$DEV_PG" psql -q -U "$DEV_DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS $DEV_DB_NAME WITH (FORCE)" \
  -c "CREATE DATABASE $DEV_DB_NAME OWNER $DEV_DB_USER" >/dev/null
docker exec bsmarker_postgres_1 pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
  | docker exec -i "$DEV_PG" psql -q -U "$DEV_DB_USER" -d "$DEV_DB_NAME" >/dev/null

if [ "$DB_ONLY" != "--db-only" ]; then
  echo "==> Copying the audio files (2.5 GB, takes a while)"
  docker run --rm \
    -v bsmarker_minio_data:/from:ro \
    -v "${PROJECT}_minio_data:/to" \
    alpine sh -c 'rm -rf /to/* /to/.minio.sys 2>/dev/null; cp -a /from/. /to/'
  docker restart bsmarker_dev_minio >/dev/null
fi

echo "==> Starting the DEV backend"
docker start "$DEV_BACKEND" >/dev/null
for _ in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$DEV_BACKEND")" = healthy ] && break
  sleep 2
done

echo "==> Setting every DEV password to DEV_USER_PASSWORD"
HASH=$(docker exec "$DEV_BACKEND" python -c \
  "from app.core.security import get_password_hash; print(get_password_hash('$DEV_USER_PASSWORD'))")
docker exec "$DEV_PG" psql -U "$DEV_DB_USER" -d "$DEV_DB_NAME" -c \
  "UPDATE users SET hashed_password = '$HASH';"

docker exec "$DEV_PG" psql -U "$DEV_DB_USER" -d "$DEV_DB_NAME" -tc \
  "SELECT 'users: '||count(*) FROM users UNION ALL SELECT 'recordings: '||count(*) FROM recordings UNION ALL SELECT 'boxes: '||count(*) FROM bounding_boxes;"

echo "Done. Log in at https://${DOMAIN}/dev/ with any production e-mail and the DEV password."
