import 'dotenv/config';
import mysql from 'mysql2/promise';

const VALID_STATUSES = new Set(['todo', 'in_progress', 'done']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

function normalizeStatus(task = {}) {
  const raw = String(task.status || '').trim().toLowerCase();
  if (VALID_STATUSES.has(raw)) return raw;
  return task.done ? 'done' : 'todo';
}

function normalizePriority(task = {}) {
  const raw = String(task.priority || '').trim().toLowerCase();
  if (VALID_PRIORITIES.has(raw)) return raw;
  return 'medium';
}

function normalizeTask(task = {}) {
  const status = normalizeStatus(task);
  const done = status === 'done';

  return {
    ...task,
    name: String(task.name || '').trim(),
    dueDate: String(task.dueDate || '').trim(),
    notes: String(task.notes || '').trim(),
    assignee: String(task.assignee || '').trim(),
    assigneeId: String(task.assigneeId || '').trim(),
    priority: normalizePriority(task),
    status,
    done,
    completedAt: done ? String(task.completedAt || '').trim() : '',
    completedBy: done ? String(task.completedBy || '').trim() : '',
    showNote: Boolean(task.showNote),
    subs: Array.isArray(task.subs)
      ? task.subs.map((sub = {}) => ({
          ...sub,
          name: String(sub.name || '').trim(),
          done: Boolean(sub.done),
        }))
      : [],
  };
}

function normalizeSections(sections = []) {
  return sections.map((section = {}, sectionIndex) => ({
    ...section,
    sec: String(section.sec || `Seção ${sectionIndex + 1}`).trim(),
    open: typeof section.open === 'boolean' ? section.open : true,
    tasks: Array.isArray(section.tasks) ? section.tasks.map(normalizeTask) : [],
  }));
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
    throw new Error('Faltam variáveis no .env (DB_NAME, DB_USER).');
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: dbPassword,
    database: DB_NAME,
  });

  const [rows] = await conn.query('SELECT client_id, sections FROM onboardings');
  let touched = 0;

  for (const row of rows) {
    let sections;
    try {
      sections = JSON.parse(row.sections || '[]');
    } catch {
      sections = [];
    }

    const normalized = normalizeSections(Array.isArray(sections) ? sections : []);
    const before = JSON.stringify(sections || []);
    const after = JSON.stringify(normalized);

    if (before !== after) {
      await conn.query('UPDATE onboardings SET sections = ? WHERE client_id = ?', [after, row.client_id]);
      touched += 1;
    }
  }

  await conn.end();
  console.log(`✓ Onboardings normalizados: ${touched}`);
}

main().catch((err) => {
  console.error('✗ Falha ao normalizar onboardings:', err);
  process.exit(1);
});
