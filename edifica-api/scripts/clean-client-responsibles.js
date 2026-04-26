import 'dotenv/config';
import { query, pool } from '../src/db/pool.js';
import { parseJson } from '../src/utils/helpers.js';

const GESTOR_ROLES = new Set(['gestor', 'admin', 'ceo', 'suporte_tecnologia']);
const GDV_ROLES = new Set(['gdv', 'admin', 'ceo', 'suporte_tecnologia']);

async function ensureSecondaryRolesColumn() {
  const cols = await query('SHOW COLUMNS FROM users');
  const names = new Set(cols.map((column) => column.Field));
  if (!names.has('secondary_roles')) {
    await query('ALTER TABLE users ADD COLUMN secondary_roles JSON NULL AFTER role');
  }
}

function hasAnyRole(user, roles) {
  if (!user) return false;
  const secondaryRoles = parseJson(user.secondary_roles, []);
  return roles.has(user.role) || secondaryRoles.some((role) => roles.has(role));
}

async function main() {
  await ensureSecondaryRolesColumn();

  const [clients, users] = await Promise.all([
    query('SELECT id, name, gestor, gdv_name FROM clients ORDER BY name ASC'),
    query('SELECT id, name, role, secondary_roles FROM users WHERE active = 1'),
  ]);

  const usersByName = new Map(users.map((user) => [String(user.name || '').trim(), user]));
  const invalidGestores = clients.filter((client) => {
    const name = String(client.gestor || '').trim();
    return name && !hasAnyRole(usersByName.get(name), GESTOR_ROLES);
  });
  const invalidGdvs = clients.filter((client) => {
    const name = String(client.gdv_name || '').trim();
    return name && !hasAnyRole(usersByName.get(name), GDV_ROLES);
  });

  for (const client of invalidGestores) {
    await query('UPDATE clients SET gestor = ? WHERE id = ?', ['', client.id]);
  }

  for (const client of invalidGdvs) {
    await query('UPDATE clients SET gdv_name = ? WHERE id = ?', ['', client.id]);
  }

  console.log(
    `Responsáveis inválidos removidos: ${invalidGestores.length} gestor(es), ${invalidGdvs.length} GDV(s).`
  );

  if (invalidGestores.length > 0) {
    console.table(invalidGestores.map((row) => ({ cliente: row.name, gestor: row.gestor })));
  }
  if (invalidGdvs.length > 0) {
    console.table(invalidGdvs.map((row) => ({ cliente: row.name, gdv: row.gdv_name })));
  }
}

main()
  .catch((err) => {
    console.error('Falha ao limpar responsáveis inválidos:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
