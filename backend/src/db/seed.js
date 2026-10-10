// Тестовые данные для демонстрации. Реальные персональные данные не используются (ТЗ п. 4.7).
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { hashPassword } from '../modules/auth/auth.service.js'
import { handleIncoming } from '../modules/leads/intake.service.js'
import { createPool } from './pool.js'
import { migrate } from './migrate.js'

// Пароль демо-учеток: одинаковый для всех, переопределяется переменной SEED_PASSWORD
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'demo12345'
if (config.isProduction && !process.env.SEED_PASSWORD && process.env.SEED_DEMO === 'true') {
  console.warn('Демо-учетки создаются с общеизвестным паролем — только для демонстрации на тестовых данных')
}

const DEMO_USERS = [
  { login: 'admin', fullName: 'Алексей Администратор', role: 'admin' },
  { login: 'manager', fullName: 'Анна Менеджер', role: 'manager' },
  { login: 'manager2', fullName: 'Игорь Продажин', role: 'manager' },
  { login: 'head', fullName: 'Ольга Руководитель', role: 'sales_head' },
  { login: 'designer', fullName: 'Денис Дизайнер', role: 'designer' },
  { login: 'marketer', fullName: 'Мария Маркетолог', role: 'marketer' },
  { login: 'director', fullName: 'Виктор Директор', role: 'director' },
]

export async function seedUsers(pool, password = DEMO_PASSWORD) {
  const passwordHash = await hashPassword(password)
  let created = 0
  for (const user of DEMO_USERS) {
    const { rowCount } = await pool.query(
      `INSERT INTO users (login, email, full_name, password_hash, role_id)
       SELECT $1, $2, $3, $4, id FROM roles WHERE code = $5
       ON CONFLICT DO NOTHING`,
      [user.login, `${user.login}@agency.test`, user.fullName, passwordHash, user.role],
    )
    created += rowCount
  }
  return created
}

// Обращения проходят через тот же обработчик, что и настоящие, поэтому повторный запуск не создает дублей
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000)
const DEMO_EVENTS = [
  {
    channel: 'telegram',
    externalMessageId: 'demo:1',
    contact: { externalId: 'demo-1001', username: 'petr_demo', name: 'Петр Соколов' },
    text: 'Здравствуйте! Нужен баннер 3×6 м к открытию магазина. Сколько это стоит?',
    receivedAt: minutesAgo(95),
  },
  {
    channel: 'telegram',
    externalMessageId: 'demo:2',
    contact: { externalId: 'demo-1001', username: 'petr_demo', name: 'Петр Соколов' },
    text: 'Открытие через две недели, успеете?',
    receivedAt: minutesAgo(93),
  },
  {
    channel: 'web',
    externalMessageId: 'demo-web-0001',
    contact: { name: 'Ирина Волкова', phone: '+7 912 000-11-22', email: 'irina@example.test' },
    text: 'Интересует размещение наружной рекламы на трех щитах в центре.',
    utm: { source: 'yandex', medium: 'cpc', campaign: 'autumn-2026' },
    receivedAt: minutesAgo(40),
  },
  {
    channel: 'web',
    externalMessageId: 'demo-web-0002',
    contact: { name: 'ООО «Вектор»', email: 'office@vector.example.test' },
    text: 'Нужны визитки и буклеты для выставки, тираж 500 штук.',
    utm: { source: 'vk', medium: 'social', campaign: 'expo' },
    receivedAt: minutesAgo(12),
  },
  {
    channel: 'telegram',
    externalMessageId: 'demo:3',
    contact: { externalId: 'demo-1002', username: 'cafe_demo', name: 'Кофейня «Зерно»' },
    text: 'Добрый день, хотим обновить вывеску. Можно пример работ?',
    receivedAt: minutesAgo(5),
  },
]

export async function seedInquiries(pool) {
  let created = 0
  for (const event of DEMO_EVENTS) {
    const result = await handleIncoming(pool, event)
    if (!result.duplicate) created += 1
  }
  return created
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(config.databaseUrl)
  try {
    await migrate(pool)
    const users = await seedUsers(pool)
    console.log(`Демо-пользователи: добавлено ${users} (логины: ${DEMO_USERS.map((u) => u.login).join(', ')})`)
    console.log(`Демо-обращения: добавлено ${await seedInquiries(pool)}`)
  } finally {
    await pool.end()
  }
}
