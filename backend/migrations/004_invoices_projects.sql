-- Счета и проекты (FR-DOC-01–03, FR-PROJ-01–03)

-- Реквизиты клиента для счета
ALTER TABLE clients ADD COLUMN inn text, ADD COLUMN address text;

-- Сквозная нумерация счетов: СЧ-<год>-<номер>
CREATE SEQUENCE invoice_number_seq;

ALTER TABLE invoices
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN created_by  bigint REFERENCES users (id),
  -- когда счет отправлен клиенту в Telegram (FR-DOC-03)
  ADD COLUMN sent_at     timestamptz;

ALTER TABLE projects ADD COLUMN completed_at timestamptz;
CREATE INDEX projects_status_idx ON projects (status);
