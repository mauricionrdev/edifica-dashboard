// ==============================================================
//  Seed - cria o primeiro admin e os squads padrão
//  Uso: node scripts/seed.js
// ==============================================================
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, query } from '../src/db/pool.js';
import { uuid } from '../src/utils/helpers.js';
import { DEFAULT_SQUADS, ONBOARDING_TEMPLATE } from '../src/utils/domain.js';

async function seedAdmin() {
  const name = process.env.SEED_ADMIN_NAME || 'Super Admin Edifica';
  const email = (process.env.SEED_ADMIN_EMAIL || 'superadmin@edifica.com.br').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'Edifica@2026!';

  const existing = await query(
    'SELECT id, email FROM users WHERE is_master = 1 LIMIT 1'
  );
  if (existing.length > 0) {
    console.log(`• Admin master já existe (${existing[0].email}). Pulando.`);
    return;
  }

  const id = uuid();
  const hash = await bcrypt.hash(password, 10);
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, is_master, squads, active)
     VALUES (?, ?, ?, ?, 'admin', 1, ?, 1)`,
    [id, name, email, hash, JSON.stringify([])]
  );
  console.log(`✓ Admin master criado: ${email}  /  senha: ${password}`);
  console.log('  Troque a senha após o primeiro login.');
}

async function seedSquads() {
  const existing = await query('SELECT COUNT(*) AS n FROM squads');
  if (existing[0].n > 0) {
    console.log(`• Squads já existem (${existing[0].n}). Pulando.`);
    return;
  }
  for (const name of DEFAULT_SQUADS) {
    await query('INSERT INTO squads (id, name) VALUES (?, ?)', [uuid(), name]);
  }
  console.log(`✓ ${DEFAULT_SQUADS.length} squad(s) padrão criado(s).`);
}

async function seedTemplate() {
  const existing = await query(
    'SELECT id FROM onboarding_template WHERE id = 1 LIMIT 1'
  );
  if (existing.length > 0) {
    console.log('• Template de onboarding já existe. Pulando.');
    return;
  }
  await query(
    `INSERT INTO onboarding_template (id, sections) VALUES (1, ?)`,
    [JSON.stringify(ONBOARDING_TEMPLATE)]
  );
  console.log('✓ Template de onboarding (Modelo Oficial) inicializado.');
}

async function main() {
  try {
    console.log('→ Seeding Edifica...');
    await seedAdmin();
    await seedSquads();
    await seedTemplate();
    console.log('✓ Seed concluído.');
  } catch (err) {
    console.error('✗ Falha no seed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
