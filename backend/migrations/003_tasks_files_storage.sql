-- Задачи и файлы (FR-TASK-01–03)

-- Срок задачи — календарная дата без времени
ALTER TABLE tasks RENAME COLUMN due_at TO due_date;
ALTER TABLE tasks ALTER COLUMN due_date TYPE date USING due_date::date;

-- Содержимое файлов для хранилища в БД (FILE_STORAGE=db): на Vercel диск контейнера
-- не сохраняется. При хранении на диске таблица остается пустой.
CREATE TABLE file_contents (
  stored_path text PRIMARY KEY REFERENCES files (stored_path) ON DELETE CASCADE,
  content     bytea NOT NULL
);
