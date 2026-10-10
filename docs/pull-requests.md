# Проверки pull request

Изменения попадают в `master` через pull request. На каждый pull request автоматически запускаются проверки; деплой на Vercel выполняется только после слияния.

## Что запускается

| Проверка | Файл | Что делает | Блокирует слияние |
|---|---|---|---|
| ESLint | `ci.yml` | линтер серверной и клиентской части | да |
| SAST (Semgrep) | `ci.yml` | уязвимости в коде, секреты, ошибки в Dockerfile и пайплайне | да |
| Master is merged | `ci.yml` | ветка содержит все коммиты `master` | да |
| Интеграционные тесты | `ci.yml` | тесты API на PostgreSQL | да |
| Сборка клиента и образов | `ci.yml` | `vite build` и оба `Dockerfile.vercel` | да |
| AI review (Claude) | `ai-review.yml` | ИИ читает изменения и оставляет замечания к строкам | через обсуждения, см. ниже |

«Блокирует» означает, что проверка завершается ошибкой при находках. Чтобы GitHub действительно не давал слить такой pull request, нужна защита ветки — см. последний раздел.

## ИИ-ревью

Проверку выполняет [Claude Code GitHub Action](https://code.claude.com/docs/en/github-actions) с плагином `code-review`. На каждое открытие и обновление pull request Claude читает изменения и публикует замечания комментариями к конкретным строкам, а если замечаний нет — один итоговый комментарий. Черновики и pull request из форков пропускаются.

ИИ-ревью — помощник, а не замена проверке человеком: оно может ошибаться и пропускать проблемы. Задание считается успешным, когда ревью опубликовано, независимо от числа замечаний; слияние блокируют неразрешенные обсуждения (см. защиту ветки).

### Настройка (один раз)

Нужна подписка Claude (Pro или Max) либо ключ API.

1. Установите GitHub-приложение Claude в репозиторий: <https://github.com/apps/claude> → **Install** → выберите `AdAgencyCRM`.
2. Создайте долгоживущий токен подписки — команда откроет браузер для подтверждения:

   ```bash
   claude setup-token
   ```

3. Сохраните токен в секреты репозитория: **Settings → Secrets and variables → Actions → New repository secret**, имя `CLAUDE_CODE_OAUTH_TOKEN`.

Шаги 1–3 выполняет и одна команда в Claude Code — `/install-github-app`; на предложение добавить файлы workflow ответьте отказом, они уже есть в репозитории.

Пока секрет не задан, задание «AI review» завершается успешно с предупреждением «ИИ-ревью пропущено» и остальным проверкам не мешает.

Вместо подписки можно использовать ключ API (оплата по токенам): сохраните его в секрет `ANTHROPIC_API_KEY` и замените в `ai-review.yml` строку `claude_code_oauth_token` на `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}` (и имя переменной в шаге проверки).

### Расход

Каждый запуск расходует лимит подписки Claude (или токены API) и минуты GitHub Actions. Повторный push в тот же pull request отменяет незавершенное ревью и запускает новое; уже прокомментированный pull request Claude повторно не разбирает.

## Как работать

```bash
git switch -c feature/название
```

```bash
git push -u origin feature/название
```

Затем откройте pull request в `master` на GitHub. Если проверка «Master is merged» красная — в `master` появились новые коммиты:

```bash
git fetch origin && git merge origin/master
```

После слияния pull request пайплайн на `master` повторяет проверки и разворачивает проект на Vercel.

## Защита ветки master

Без нее проверки только показывают результат, но не мешают слиянию и прямому push.

**Settings → Branches → Add branch ruleset** (или *Add classic branch protection rule*) для `master`:

- **Require a pull request before merging** — запрет прямого push в `master`;
- **Require status checks to pass** — отметьте: `ESLint (backend)`, `ESLint (frontend)`, `SAST (Semgrep)`, `Master is merged`, `Интеграционные тесты`, `Сборка клиента и образов`, `AI review (Claude)`;
- **Require conversation resolution before merging** — pull request нельзя слить, пока замечания ИИ-ревью (и людей) не отмечены как решенные.

Названия проверок появятся в списке после первого запуска пайплайна на pull request. На бесплатном плане GitHub защита веток доступна для публичных репозиториев.
