// ==============================================================
//  Migrations runner
//  Executa todos os .sql em ordem alfabética dentro de /migrations
//  Uso: node migrations/run.js
// ==============================================================

import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function splitSqlStatements(sql) {
  // Remove comentários de linha e divide em statements por ';' fora de strings.
  // Simples e suficiente para nossos arquivos.
  const cleaned = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  return cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const {
    DB_HOST = 'localhost',
    DB_PORT = '3306',
    DB_NAME,
    DB_USER,
    DB_PASS,
    DB_PASSWORD,
  } = process.env;

  const dbPassword = DB_PASS || DB_PASSWORD;

  if (!DB_NAME || !DB_USER) {
    console.error('Faltam variáveis no .env (DB_NAME, DB_USER).');
    process.exit(1);
  }

  // Conecta sem database primeiro, para garantir que ela existe.
  const rootConn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: dbPassword,
    multipleStatements: false,
  });
  await rootConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` ` +
      `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await rootConn.end();

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: dbPassword,
    database: DB_NAME,
    multipleStatements: false,
  });

  const files = (await readdir(__dirname))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`→ Rodando ${files.length} migration(s) em ${DB_NAME}...`);

  for (const file of files) {
    const full = join(__dirname, file);
    const sql = await readFile(full, 'utf8');
    const statements = splitSqlStatements(sql);
    console.log(`  • ${file} (${statements.length} statements)`);
    for (const stmt of statements) {
      await conn.query(stmt);
    }
  }

  await conn.end();
  console.log('✓ Migrations aplicadas.');
}

main().catch((err) => {
  console.error('✗ Falha ao rodar migrations:', err);
  process.exit(1);
});
