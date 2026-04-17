// ==============================================================
//  Pool MySQL
// ==============================================================
import 'dotenv/config';
import mysql from 'mysql2/promise';

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_NAME,
  DB_USER,
  DB_PASS,
  DB_CONNECTION_LIMIT = '10',
} = process.env;

if (!DB_NAME || !DB_USER) {
  throw new Error(
    'Configuração de banco ausente: defina DB_NAME e DB_USER no .env.'
  );
}

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(DB_CONNECTION_LIMIT),
  queueLimit: 0,
  // Garante que booleanos voltem como 0/1 e datas como Date (padrão).
  dateStrings: false,
  timezone: 'Z',
  namedPlaceholders: false,
});

/**
 * Helper: roda uma query e devolve apenas as rows.
 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Helper: executa uma transação. O callback recebe o objeto `conn`
 * para usar nos queries dentro da transação.
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function healthCheck() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}
