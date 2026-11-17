<script setup>
import { onBeforeUnmount, reactive, watch } from 'vue'
import { api } from '../api.js'
import { fileSize, shortTime, fullTime } from '../labels.js'
import { openProtectedFile } from '../openFile.js'

// Список файлов с миниатюрами изображений. Файлы защищены токеном,
// поэтому миниатюры загружаются через API и показываются из памяти браузера.
const props = defineProps({
  files: { type: Array, required: true },
  compact: { type: Boolean, default: false },
})

const previews = reactive({})
const errors = reactive({})

async function loadPreview(file) {
  if (!file.isPreviewable || previews[file.id]) return
  try {
    previews[file.id] = URL.createObjectURL(await api.blob(`/files/${file.id}`))
  } catch {
    // без миниатюры файл по-прежнему можно открыть кнопкой
  }
}

watch(() => props.files, (files) => files.forEach(loadPreview), { immediate: true })

async function open(file, download = false) {
  errors[file.id] = ''
  try {
    await openProtectedFile(`/files/${file.id}${download ? '?download=1' : ''}`, { download, fileName: file.name })
  } catch (error) {
    errors[file.id] = error.message
  }
}

onBeforeUnmount(() => Object.values(previews).forEach((url) => URL.revokeObjectURL(url)))
</script>

<template>
  <ul class="files" :class="{ compact }">
    <li v-for="file in files" :key="file.id" class="file">
      <button class="thumb" type="button" :title="`Открыть ${file.name}`" @click="open(file)">
        <img v-if="previews[file.id]" :src="previews[file.id]" :alt="file.name" />
        <span v-else class="ext">{{ file.name.split('.').pop() }}</span>
      </button>
      <span class="meta">
        <b :title="file.name">{{ file.name }}</b>
        <small>
          {{ fileSize(file.size) }}
          <template v-if="!compact"> · {{ file.uploadedBy?.fullName ?? 'Сотрудник' }} · <time :title="fullTime(file.createdAt)">{{ shortTime(file.createdAt) }}</time></template>
        </small>
        <small v-if="errors[file.id]" class="error" role="alert">{{ errors[file.id] }}</small>
      </span>
      <button class="btn btn-ghost btn-small" type="button" @click="open(file, true)">Скачать</button>
    </li>
  </ul>
</template>

<style scoped src="../styles/file-list.css"></style>
