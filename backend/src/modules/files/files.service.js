import { withTransaction } from '../../db/pool.js'
import { badRequest } from '../../errors.js'

// Допустимые форматы макетов и документов. Тип определяется по расширению на сервере,
// а не по заголовку от браузера.
const TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  zip: 'application/zip',
  psd: 'image/vnd.adobe.photoshop',
  ai: 'application/postscript',
  eps: 'application/postscript',
  cdr: 'application/vnd.corel-draw',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
}

// Эти типы браузер может безопасно показать сам; остальные отдаются только на скачивание
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])

export const ALLOWED_EXTENSIONS = Object.keys(TYPES)

export function toFile(row) {
  return {
    id: row.id,
    name: row.original_name,
    mimeType: row.mime_type,
    size: row.size_bytes,
    isPreviewable: INLINE_TYPES.has(row.mime_type) && row.mime_type !== 'application/pdf',
    uploadedBy: row.uploaded_by ? { id: row.uploaded_by, fullName: row.uploader_name ?? null } : null,
    taskId: row.task_id,
    createdAt: row.created_at,
  }
}

// Имя файла приходит в заголовке X-File-Name в кодировке encodeURIComponent
export function parseFileName(header) {
  let name
  try {
    name = decodeURIComponent(String(header ?? ''))
  } catch {
    throw badRequest('Некорректное имя файла')
  }
  // только имя, без каталогов и управляющих символов
  name = name.split(/[\\/]/).pop().replace(/[\p{Cc}"]/gu, '').trim().slice(0, 200)
  if (!name) throw badRequest('Не указано имя файла')
  return name
}

export function mimeTypeFor(name) {
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  const type = TYPES[extension]
  if (!type) {
    throw badRequest(`Формат файла не поддерживается. Допустимые: ${ALLOWED_EXTENSIONS.join(', ')}`)
  }
  return type
}

// Сохраняет содержимое в хранилище и метаданные в таблицу files в одной транзакции
export async function saveFile(pool, storage, { content, name, uploadedBy, taskId = null, dealId = null }) {
  if (!Buffer.isBuffer(content) || content.length === 0) throw badRequest('Файл пустой')
  const mimeType = mimeTypeFor(name)
  const key = storage.newKey()
  try {
    return await withTransaction(pool, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO files (original_name, stored_path, mime_type, size_bytes, uploaded_by, task_id, deal_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [name, key, mimeType, content.length, uploadedBy?.id ?? null, taskId, dealId],
      )
      await storage.write(key, content, db)
      return toFile({ ...rows[0], uploader_name: uploadedBy?.fullName })
    })
  } catch (error) {
    await storage.remove(key)
    throw error
  }
}

// Отдает файл. Заголовки не дают браузеру выполнить содержимое как страницу нашего сайта.
export async function sendFile(res, storage, row, { download = false } = {}) {
  const content = await storage.read(row.stored_path)
  const inline = !download && INLINE_TYPES.has(row.mime_type)
  const encoded = encodeURIComponent(row.original_name)
  res.set({
    'Content-Type': row.mime_type,
    'Content-Length': String(content.length),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="file"; filename*=UTF-8''${encoded}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    'Cache-Control': 'private, max-age=300',
  })
  res.end(content)
}
