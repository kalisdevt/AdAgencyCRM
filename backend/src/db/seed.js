// Тестовые данные для демонстрации. Реальные персональные данные не используются (ТЗ п. 4.7).
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { hashPassword } from '../modules/auth/auth.service.js'
import { createPool } from './pool.js'
import { migrate } from './migrate.js'

// Пароль демо-учеток: одинаковый для всех, переопределяется переменной SEED_PASSWORD
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'demo12345'

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(config.databaseUrl)
  try {
    await migrate(pool)
    const users = await seedUsers(pool)
    console.log(`Демо-пользователи: добавлено ${users} (логины: ${DEMO_USERS.map((u) => u.login).join(', ')})`)
  } finally {
    await pool.end()
  }
}
