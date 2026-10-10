-- Пользователи и роли, клиенты, сделки (лиды), сообщения, справочники (ТЗ п. 4.3)

CREATE TABLE roles (
  id   smallserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL
);

INSERT INTO roles (code, name) VALUES
  ('admin',      'Администратор'),
  ('manager',    'Менеджер по работе с клиентами'),
  ('designer',   'Дизайнер'),
  ('marketer',   'Маркетолог'),
  ('sales_head', 'Руководитель отдела продаж'),
  ('director',   'Директор'),
  ('client',     'Клиент');

CREATE TABLE clients (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL,
  phone      text,
  email      text,
  company    text,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_phone_idx ON clients (phone) WHERE phone IS NOT NULL;
CREATE INDEX clients_email_idx ON clients (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  login         text NOT NULL,
  email         text,
  full_name     text NOT NULL,
  password_hash text NOT NULL,
  role_id       smallint NOT NULL REFERENCES roles (id),
  -- заполняется только для роли «Клиент»: чьи заказы видит учетная запись
  client_id     bigint REFERENCES clients (id),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_login_key ON users (lower(login));
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE email IS NOT NULL;

-- Контакт клиента в канале: по нему клиент находится при повторном обращении
CREATE TABLE client_contacts (
  id           bigserial PRIMARY KEY,
  client_id    bigint NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('telegram', 'web', 'vk')),
  external_id  text NOT NULL,
  username     text,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);
CREATE INDEX client_contacts_client_idx ON client_contacts (client_id);

CREATE TABLE campaigns (
  id         bigserial PRIMARY KEY,
  code       text NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX campaigns_code_key ON campaigns (lower(code));

CREATE TABLE refusal_reasons (
  id        smallserial PRIMARY KEY,
  name      text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);

INSERT INTO refusal_reasons (name) VALUES
  ('Дорого'),
  ('Выбрали другое агентство'),
  ('Не устроили сроки'),
  ('Клиент перестал отвечать'),
  ('Нецелевое обращение'),
  ('Другое');

-- Сделка. Лид — сделка на стадии «Новый» (new).
CREATE TABLE deals (
  id                bigserial PRIMARY KEY,
  client_id         bigint NOT NULL REFERENCES clients (id),
  title             text NOT NULL,
  stage             text NOT NULL DEFAULT 'new' CHECK (stage IN
                      ('new', 'qualification', 'proposal_prep', 'proposal_sent', 'invoiced', 'paid', 'refused')),
  amount            numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  source_channel    text NOT NULL CHECK (source_channel IN ('telegram', 'web', 'vk', 'manual')),
  campaign_id       bigint REFERENCES campaigns (id),
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  assignee_id       bigint REFERENCES users (id),
  refusal_reason_id smallint REFERENCES refusal_reasons (id),
  refusal_comment   text,
  first_response_at timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- FR-DEAL-03: отказ невозможен без причины
  CONSTRAINT deals_refusal_reason_required CHECK (stage <> 'refused' OR refusal_reason_id IS NOT NULL)
);
CREATE INDEX deals_client_idx ON deals (client_id);
CREATE INDEX deals_stage_idx ON deals (stage);
CREATE INDEX deals_assignee_idx ON deals (assignee_id);

CREATE TABLE messages (
  id          bigserial PRIMARY KEY,
  deal_id     bigint NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  client_id   bigint NOT NULL REFERENCES clients (id),
  channel     text NOT NULL CHECK (channel IN ('telegram', 'web', 'vk')),
  direction   text NOT NULL CHECK (direction IN ('in', 'out')),
  -- идентификатор сообщения во внешнем канале
  external_id text,
  body        text NOT NULL,
  author_id   bigint REFERENCES users (id),
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- ТЗ п. 4.5: повторная доставка того же сообщения не создает дубликат
  CONSTRAINT messages_channel_external_id_key UNIQUE (channel, external_id)
);
CREATE INDEX messages_deal_idx ON messages (deal_id, created_at);
CREATE INDEX messages_unread_idx ON messages (deal_id) WHERE direction = 'in' AND NOT is_read;
