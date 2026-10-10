#!/usr/bin/env sh
# Восстановление базы данных из копии, созданной backup.sh: ./scripts/restore.sh <файл>
# Текущие данные базы заменяются содержимым копии.
set -eu

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "Использование: $0 <файл резервной копии>" >&2
  exit 1
fi
FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"

cd "$(dirname "$0")/.."
docker compose exec -T db pg_restore -U crm -d crm --clean --if-exists --no-owner --single-transaction < "$FILE"
echo "База данных восстановлена из $FILE"
