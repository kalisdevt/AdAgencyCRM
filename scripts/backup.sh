#!/usr/bin/env sh
# Резервная копия базы данных и файлового хранилища (ТЗ п. 4.5).
# Запуск из корня проекта: ./scripts/backup.sh [файл]
# Рядом с копией БД (.dump) сохраняется архив файлов (макеты, счета) — .files.tar.gz
set -eu

cd "$(dirname "$0")/.."
mkdir -p backups
FILE="${1:-backups/crm-$(date +%Y%m%d-%H%M%S).dump}"
FILES_ARCHIVE="${FILE%.dump}.files.tar.gz"

docker compose exec -T db pg_dump -U crm -d crm --format=custom > "$FILE"
echo "Резервная копия БД сохранена: $FILE ($(wc -c < "$FILE" | tr -d ' ') байт)"

# Файлы лежат в томе контейнера backend (FILE_STORAGE=disk); при хранении в БД каталог пустой
if docker compose ps --status running --services | grep -qx backend; then
  docker compose exec -T backend tar czf - -C /app storage > "$FILES_ARCHIVE"
  echo "Архив файлов сохранен: $FILES_ARCHIVE ($(wc -c < "$FILES_ARCHIVE" | tr -d ' ') байт)"
else
  echo "Контейнер backend не запущен: архив файлов не создан" >&2
fi
