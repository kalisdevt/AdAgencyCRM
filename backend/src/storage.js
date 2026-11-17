import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Файловое хранилище (ТЗ п. 4.3): в БД — метаданные файла (таблица files), содержимое — здесь.
// Единый интерфейс для двух вариантов:
//   disk — каталог на диске сервера (локально и в Docker Compose, том storage);
//   db   — таблица file_contents (Vercel: диск контейнера не сохраняется между запусками).
// Ключ генерирует сервер, поэтому он никогда не содержит данных из запроса.

const KEY_PATTERN = /^[0-9]{4}-[0-9]{2}\/[0-9a-f-]{36}$/

function newKey() {
  return `${new Date().toISOString().slice(0, 7)}/${randomUUID()}`
}

function assertKey(key) {
  if (!KEY_PATTERN.test(key)) throw new Error(`Некорректный ключ файла: ${key}`)
}

export function createDiskStorage(dir) {
  const root = path.resolve(dir)
  const fullPath = (key) => {
    assertKey(key)
    return path.join(root, ...key.split('/'))
  }
  return {
    kind: 'disk',
    newKey,
    async write(key, content) {
      const target = fullPath(key)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, content)
    },
    async read(key) {
      return readFile(fullPath(key))
    },
    async remove(key) {
      await unlink(fullPath(key)).catch(() => {})
    },
  }
}

// db — соединение в рамках транзакции, в которой создается строка files (внешний ключ file_contents → files)
export function createDbStorage(pool) {
  return {
    kind: 'db',
    newKey,
    async write(key, content, db = pool) {
      assertKey(key)
      await db.query('INSERT INTO file_contents (stored_path, content) VALUES ($1, $2)', [key, content])
    },
    async read(key) {
      assertKey(key)
      const { rows } = await pool.query('SELECT content FROM file_contents WHERE stored_path = $1', [key])
      if (!rows[0]) throw new Error(`Содержимое файла не найдено: ${key}`)
      return rows[0].content
    },
    async remove() {
      // строка file_contents удаляется вместе с files (ON DELETE CASCADE)
    },
  }
}

export function createStorage({ kind, dir, pool }) {
  return kind === 'db' ? createDbStorage(pool) : createDiskStorage(dir)
}
