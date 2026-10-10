import pg from 'pg'

// numeric(12,2) возвращаем числом: суммы сделок укладываются в точность double
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number)
// bigint-идентификаторы далеки от 2^53, поэтому безопасно читать их как числа
pg.types.setTypeParser(pg.types.builtins.INT8, Number)

export function createPool(connectionString) {
  return new pg.Pool({ connectionString, max: 10 })
}

export async function withTransaction(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
