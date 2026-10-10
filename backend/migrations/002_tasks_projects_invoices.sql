-- Задачи, комментарии, файлы, проекты и этапы, счета, уведомления (ТЗ п. 4.3).
-- Таблицы создаются заранее, чтобы следующие модули добавлялись без перестройки схемы.

CREATE TABLE tasks (
  id          bigserial PRIMARY KEY,
  deal_id     bigint NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'review', 'done')),
  assignee_id bigint NOT NULL REFERENCES users (id),
  author_id   bigint NOT NULL REFERENCES users (id),
  due_at      timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_deal_idx ON tasks (deal_id);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id, status);

CREATE TABLE comments (
  id         bigserial PRIMARY KEY,
  task_id    bigint NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  author_id  bigint NOT NULL REFERENCES users (id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_task_idx ON comments (task_id, created_at);

-- Метаданные файлов; сами файлы лежат в файловом хранилище сервера
CREATE TABLE files (
  id            bigserial PRIMARY KEY,
  original_name text NOT NULL,
  stored_path   text NOT NULL UNIQUE,
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes >= 0),
  uploaded_by   bigint REFERENCES users (id),
  task_id       bigint REFERENCES tasks (id) ON DELETE CASCADE,
  deal_id       bigint REFERENCES deals (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_task_idx ON files (task_id);
CREATE INDEX files_deal_idx ON files (deal_id);

CREATE TABLE projects (
  id         bigserial PRIMARY KEY,
  -- один проект на оплаченную сделку
  deal_id    bigint NOT NULL UNIQUE REFERENCES deals (id),
  client_id  bigint NOT NULL REFERENCES clients (id),
  title      text NOT NULL,
  manager_id bigint REFERENCES users (id),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_client_idx ON projects (client_id);

CREATE TABLE project_stages (
  id         bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  code       text NOT NULL CHECK (code IN ('design', 'approval', 'printing', 'placement', 'completed')),
  position   smallint NOT NULL,
  is_done    boolean NOT NULL DEFAULT false,
  done_at    timestamptz,
  done_by    bigint REFERENCES users (id),
  UNIQUE (project_id, code)
);

CREATE TABLE invoices (
  id        bigserial PRIMARY KEY,
  deal_id   bigint NOT NULL REFERENCES deals (id),
  number    text NOT NULL UNIQUE,
  amount    numeric(12, 2) NOT NULL CHECK (amount > 0),
  status    text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  file_id   bigint REFERENCES files (id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at   timestamptz
);
CREATE INDEX invoices_deal_idx ON invoices (deal_id);

CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  link       text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, is_read, created_at DESC);
