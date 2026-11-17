-- Аналитика и справочники (FR-AN-02, FR-ADM-02)

-- Кампании можно скрыть из выбора, не теряя статистику
ALTER TABLE campaigns ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Расходы на рекламную кампанию вводятся вручную (импорт из рекламных кабинетов исключен из MVP)
CREATE TABLE campaign_expenses (
  id          bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  spent_on    date NOT NULL,
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  comment     text,
  created_by  bigint REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_expenses_campaign_idx ON campaign_expenses (campaign_id, spent_on);

-- Отчеты строятся по дате создания и закрытия сделки
CREATE INDEX deals_created_idx ON deals (created_at);
CREATE INDEX deals_closed_idx ON deals (closed_at) WHERE closed_at IS NOT NULL;
