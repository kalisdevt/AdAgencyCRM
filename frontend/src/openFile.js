import { api } from './api.js'

// Открывает защищенный токеном файл (PDF счета, макет) в новой вкладке или скачивает его.
// Окно открывается сразу по клику — иначе браузер заблокирует его как всплывающее.
export async function openProtectedFile(path, { download = false, fileName = 'file' } = {}) {
  const target = download ? null : window.open('', '_blank')
  try {
    const url = URL.createObjectURL(await api.blob(path))
    if (target) {
      target.location.href = url
    } else {
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    target?.close()
    throw error
  }
}
