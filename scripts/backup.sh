#!/usr/bin/env sh
# Резервная копия базы данных (ТЗ п. 4.5). Запуск из корня проекта: ./scripts/backup.sh [файл]
set -eu

cd "$(dirname "$0")/.."
mkdir -p backups
FILE="${1:-backups/crm-$(date +%Y%m%d-%H%M%S).dump}"

docker compose exec -T db pg_dump -U crm -d crm --format=custom > "$FILE"
echo "Резервная копия сохранена: $FILE ($(wc -c < "$FILE" | tr -d ' ') байт)"
