#!/usr/bin/env sh
# Восстановление из копии, созданной backup.sh: ./scripts/restore.sh <файл .dump>
# Текущие данные базы заменяются содержимым копии; если рядом есть архив файлов
# (<имя>.files.tar.gz), восстанавливается и файловое хранилище.
set -eu

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "Использование: $0 <файл резервной копии>" >&2
  exit 1
fi
FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
FILES_ARCHIVE="${FILE%.dump}.files.tar.gz"

cd "$(dirname "$0")/.."
docker compose exec -T db pg_restore -U crm -d crm --clean --if-exists --no-owner --single-transaction < "$FILE"
echo "База данных восстановлена из $FILE"

if [ -f "$FILES_ARCHIVE" ]; then
  docker compose exec -T backend sh -c 'rm -rf /app/storage/* && tar xzf - -C /app' < "$FILES_ARCHIVE"
  echo "Файлы восстановлены из $FILES_ARCHIVE"
fi
