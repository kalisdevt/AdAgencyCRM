# Деплой на Vercel

Проект разворачивается на бесплатном плане Vercel (Hobby) и доступен по ссылке вида `https://<проект>.vercel.app`. Деплой выполняет пайплайн GitHub Actions после успешных проверок; ниже — разовая настройка.

## Как проект устроен на Vercel

Vercel не запускает `docker-compose.yml`, но умеет собирать и запускать контейнеры из файла `Dockerfile.vercel` (Container Runtime) и объединять несколько сервисов в одном проекте (Services). Обе возможности в статусе Beta и доступны на всех планах, включая бесплатный.

| Docker Compose (локально) | Vercel |
|---|---|
| `frontend` — nginx с собранным клиентом | сервис `frontend`: `frontend/Dockerfile.vercel` |
| `backend` — API на Node.js | сервис `backend`: `backend/Dockerfile.vercel` |
| nginx проксирует `/api` на backend | правила `rewrites` в `vercel.json` |
| `db` — контейнер PostgreSQL | база Neon из Vercel Marketplace (бесплатный тариф) |
| переменные в `docker-compose.yml` / `.env` | Environment Variables проекта Vercel |

Конфигурация лежит в [`vercel.json`](../vercel.json): запросы `/api/*` идут в сервис `backend`, все остальные — в `frontend`. Контейнер базы данных на Vercel запустить нельзя: файловая система контейнеров не сохраняется между запусками, поэтому PostgreSQL подключается как внешний сервис.

## Что понадобится

- аккаунт GitHub с этим репозиторием;
- Node.js (для Vercel CLI);
- 15–20 минут.

## Шаг 1. Аккаунт и проект Vercel

1. Зарегистрируйтесь на <https://vercel.com/signup> через GitHub, план **Hobby**.
2. Установите CLI и войдите:

   ```bash
   npm install --global vercel
   ```

   ```bash
   vercel login
   ```

3. В корне репозитория привяжите каталог к новому проекту:

   ```bash
   vercel link
   ```

   На вопросы отвечайте: *Set up* — **yes**; scope — ваш аккаунт; *Link to existing project* — **no**; имя — например `crm-agency`; каталог — `./`. Сервисы CLI определит сам по `vercel.json`.

   Команда создаст каталог `.vercel/` (он в `.gitignore`) с файлом `project.json` — из него на шаге 4 понадобятся `orgId` и `projectId`.

## Шаг 2. База данных PostgreSQL (Neon)

1. Откройте проект в панели Vercel → вкладка **Storage** → **Create Database** → **Neon** → тариф **Free**.
2. Регион выберите **Washington, D.C. (iad1)** — в нем по умолчанию работают функции Vercel.
3. Подключите базу к проекту для окружения **Production** (и Preview, если нужно).

Vercel сам добавит переменные `DATABASE_URL` (через пул соединений) и `DATABASE_URL_UNPOOLED` (прямое соединение). Приложение использует первую для работы, вторую — для миграций. Таблицы создаются автоматически при первом запуске.

## Шаг 3. Переменные окружения

Добавьте в **Settings → Environment Variables** (окружение Production) или командой `vercel env add ИМЯ production`:

| Переменная | Значение | Обязательна |
|---|---|---|
| `JWT_SECRET` | случайная строка, например из `openssl rand -hex 32` | да |
| `SEED_DEMO` | `true` — создать демо-пользователей и тестовые обращения | для демонстрации |
| `SEED_PASSWORD` | **свой** пароль демо-пользователей | настоятельно рекомендуется |
| `TELEGRAM_BOT_TOKEN` | токен тестового бота | нет |
| `TELEGRAM_WEBHOOK_SECRET` | случайная строка для вебхука | если задан токен |

> Сайт будет открыт всему интернету. Без `SEED_PASSWORD` демо-учетки (включая `admin`) создаются с паролем из README, который виден в репозитории. Задайте свой пароль **до первого деплоя**: уже созданным пользователям seed пароль не меняет.

`PORT`, `NODE_ENV`, `TRUST_PROXY` и `DB_POOL_MAX` заданы в `backend/Dockerfile.vercel`, добавлять их не нужно.

## Шаг 4. Первый деплой вручную

Проверьте, что все собирается, до подключения пайплайна:

```bash
vercel deploy --prod
```

Команда выведет адрес. Откройте его и войдите как `manager` с паролем из `SEED_PASSWORD`. Проверка API: `https://<адрес>/api/health` должен вернуть `{"status":"ok","database":"ok",...}`.

Постоянный адрес проекта (`https://<проект>.vercel.app`) показан в панели Vercel в разделе **Domains**.

## Шаг 5. Секреты для GitHub Actions

1. Создайте токен: <https://vercel.com/account/tokens> → **Create Token**.
2. Возьмите идентификаторы из `.vercel/project.json`:

   ```bash
   cat .vercel/project.json
   ```

3. В репозитории GitHub: **Settings → Secrets and variables → Actions → New repository secret** — добавьте три секрета:

   | Секрет | Значение |
   |---|---|
   | `VERCEL_TOKEN` | токен из п. 1 |
   | `VERCEL_ORG_ID` | `orgId` из `project.json` |
   | `VERCEL_PROJECT_ID` | `projectId` из `project.json` |

   То же через GitHub CLI: `gh secret set VERCEL_TOKEN` (значение вводится скрыто).

Токен дает полный доступ к аккаунту Vercel — не сохраняйте его в файлах проекта.

## Шаг 6. Пайплайн

Проверки описаны в [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) и запускаются на каждый pull request в `master` и на каждый push в `master`. Деплой — отдельный workflow [`deploy.yml`](../.github/workflows/deploy.yml): он стартует сам, когда проверки успешно завершились для push в `master`, поэтому в pull request задания деплоя нет.

| Задание | Что проверяет |
|---|---|
| **ESLint** | статический анализ кода серверной и клиентской части (`npm run lint`), предупреждения считаются ошибками |
| **SAST (Semgrep)** | уязвимости в JavaScript/Node.js/Express, секреты в коде, ошибки в Dockerfile и самом пайплайне |
| **Master is merged** | ветка содержит все коммиты `master` — проверки идут на актуальном коде |
| **Интеграционные тесты** | 34 теста API на настоящем PostgreSQL |
| **Сборка клиента и образов** | `vite build` и сборка обоих `Dockerfile.vercel` |
| **Деплой на Vercel** (`deploy.yml`) | последний этап: только после push в `master` и только если все задания выше прошли |

Автоматический деплой самого Vercel при push отключен (`git.deploymentEnabled: false` в `vercel.json`), иначе код попадал бы в production в обход проверок.

После слияния в `master` откройте вкладку **Actions**: сначала идет запуск «CI/CD», за ним — «Deploy»; адрес развернутой версии появится в его сводке.

Проверки pull request, ИИ-ревью и защита ветки `master` описаны в [pull-requests.md](pull-requests.md).

Локально те же проверки:

```bash
cd backend && npm run lint && npm test
```

```bash
cd frontend && npm run lint && npm run build
```

## Telegram на Vercel

Длинный опрос (`TELEGRAM_POLLING`) на Vercel не работает: контейнер останавливается, когда нет запросов. Используйте вебхук — один раз зарегистрируйте адрес (подставьте токен, домен и секрет из `TELEGRAM_WEBHOOK_SECRET`):

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook" \
  -d "url=https://<проект>.vercel.app/api/channels/telegram/webhook" \
  -d "secret_token=<СЕКРЕТ>" \
  -d "allowed_updates=[\"message\"]"
```

## Ограничения бесплатного размещения

- **Холодный старт.** Через 5 минут без запросов контейнеры останавливаются, база Neon тоже засыпает. Первый запрос после простоя занимает несколько секунд — перед демонстрацией откройте сайт заранее.
- **Beta.** Container Runtime и Services — новые возможности Vercel; их поведение и лимиты могут измениться.
- **Файлы не сохраняются.** Загрузку макетов и PDF счетов (следующие этапы) на Vercel нужно будет хранить во внешнем хранилище (Vercel Blob), а не на диске контейнера.
- **Ограничение частоты заявок** с веб-формы считается в памяти экземпляра и сбрасывается при его перезапуске.
- План Hobby предназначен для некоммерческого использования; лимиты — <https://vercel.com/docs/limits>.

## Если что-то пошло не так

| Симптом | Причина и решение |
|---|---|
| Сайт открывается, а вход возвращает ошибку 500/502 | Сервис `backend` не стартовал. Смотрите логи: `vercel logs <адрес>` или вкладка **Logs**. Чаще всего не задан `JWT_SECRET` или база не подключена к окружению Production |
| `ECONNREFUSED ...:5432` в логах | Нет переменной `DATABASE_URL` — повторите шаг 2 и переразверните |
| Задание «Деплой» падает на проверке секретов | Не заданы секреты из шага 5 |
| Задание «Master is merged» красное | В ветке нет свежих коммитов `master`: `git fetch origin && git merge origin/master` |
| Не подходит пароль демо-пользователя | Пользователи созданы до установки `SEED_PASSWORD`. Смените пароль в базе или пересоздайте базу Neon |

## Проверка конфигурации локально

`vercel dev` поднимает оба сервиса из `vercel.json` в Docker так же, как Vercel (нужен запущенный Docker и PostgreSQL из `docker compose up -d db`):

```bash
DATABASE_URL=postgres://crm:crm@host.docker.internal:5432/crm JWT_SECRET=local vercel dev -L
```

## Источники

- [Container Runtime](https://vercel.com/docs/functions/container-images) — запуск контейнеров из `Dockerfile.vercel`
- [Services](https://vercel.com/docs/services) — несколько сервисов в одном проекте
- [How Docker Compose concepts map to Vercel](https://vercel.com/kb/guide/docker-compose-concepts-on-vercel)
- [Deploy a Node.js app on Vercel with Docker](https://vercel.com/kb/guide/deploy-nodejs-on-vercel-with-docker)
- [How to use GitHub Actions with Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)
- [Neon в Vercel Marketplace](https://vercel.com/marketplace/neon)
