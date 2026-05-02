import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { badRequest, conflict, notFound, uuid } from '../utils/helpers.js';
import { writeAuditLog } from '../utils/audit.js';
import { hasPermission } from '../utils/permissions.js';

const router = Router();

let schemaPromise = null;

function slugifySegment(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function parseJson(value, fallback = []) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function ensureGdvSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const tables = await query("SHOW TABLES LIKE 'gdvs'");
      if (tables.length === 0) {
        await query(`
          CREATE TABLE gdvs (
            id CHAR(36) NOT NULL,
            name VARCHAR(160) NOT NULL,
            owner_user_id CHAR(36) NULL,
            active TINYINT(1) NOT NULL DEFAULT 0,
            logo_data_url MEDIUMTEXT NULL,
            custom_slug VARCHAR(180) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uk_gdvs_name (name),
            UNIQUE KEY uk_gdvs_custom_slug (custom_slug),
            KEY idx_gdvs_owner (owner_user_id),
            CONSTRAINT fk_gdvs_owner
              FOREIGN KEY (owner_user_id) REFERENCES users(id)
              ON DELETE SET NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        return;
      }

      const cols = await query('SHOW COLUMNS FROM gdvs');
      const names = new Set(cols.map((col) => col.Field));

      if (!names.has('owner_user_id')) {
        await query('ALTER TABLE gdvs ADD COLUMN owner_user_id CHAR(36) NULL AFTER name');
      }
      if (!names.has('active')) {
        await query('ALTER TABLE gdvs ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 0 AFTER owner_user_id');
      }
      if (!names.has('logo_data_url')) {
        await query('ALTER TABLE gdvs ADD COLUMN logo_data_url MEDIUMTEXT NULL AFTER active');
      }
      if (!names.has('custom_slug')) {
        await query('ALTER TABLE gdvs ADD COLUMN custom_slug VARCHAR(180) NULL AFTER logo_data_url');
      }

      const indexes = await query('SHOW INDEX FROM gdvs');
      const indexNames = new Set(indexes.map((idx) => idx.Key_name));
      if (!indexNames.has('idx_gdvs_owner')) {
        await query('ALTER TABLE gdvs ADD INDEX idx_gdvs_owner (owner_user_id)');
      }
      if (!indexNames.has('uk_gdvs_custom_slug')) {
        await query('ALTER TABLE gdvs ADD UNIQUE KEY uk_gdvs_custom_slug (custom_slug)');
      }
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

function hasGdvRole(row) {
  const secondary = parseJson(row?.secondary_roles, []);
  return row?.role === 'gdv' || secondary.includes('gdv');
}

function normalizeLogo(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (!clean.startsWith('data:image/')) throw badRequest('Imagem do GDV inválida');
  return clean;
}

function normalizeCustomSlug(value) {
  return slugifySegment(value);
}

async function validateOwner(ownerUserId) {
  const clean = String(ownerUserId || '').trim();
  if (!clean) return null;

  const rows = await query(
    `SELECT id, name, email, role, secondary_roles, active
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [clean]
  );
  const owner = rows[0];
  if (!owner || !owner.active || !hasGdvRole(owner)) {
    throw badRequest('Selecione um usuário GDV ativo como proprietário.');
  }
  return owner;
}

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id || '',
    owner: row.owner_user_id
      ? {
          id: row.owner_user_id,
          name: row.owner_name || '',
          email: row.owner_email || '',
          role: row.owner_role || '',
          active: Boolean(row.owner_active),
        }
      : null,
    active: Boolean(row.active),
    logoUrl: row.logo_data_url || '',
    customSlug: row.custom_slug || '',
    slug: row.custom_slug || slugifySegment(row.name) || row.id,
    clientsCount: Number(row.clients_count) || 0,
    activeClients: Number(row.active_clients) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listRows() {
  await ensureGdvSchema();
  return query(
    `SELECT g.id, g.name, g.owner_user_id, g.active, g.logo_data_url, g.custom_slug, g.created_at, g.updated_at,
            u.name AS owner_name, u.email AS owner_email, u.role AS owner_role, u.active AS owner_active,
            COUNT(c.id) AS clients_count,
            SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS active_clients
       FROM gdvs g
       LEFT JOIN users u ON u.id = g.owner_user_id
       LEFT JOIN clients c ON c.gdv_name = g.name
      GROUP BY g.id, g.name, g.owner_user_id, g.active, g.logo_data_url, g.custom_slug, g.created_at, g.updated_at,
               u.name, u.email, u.role, u.active
      ORDER BY g.name ASC`
  );
}

async function ensureUniqueCustomSlug(customSlug, excludeId = null) {
  if (!customSlug) return;
  const params = [customSlug];
  let sql = 'SELECT id FROM gdvs WHERE custom_slug = ?';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';

  const rows = await query(sql, params);
  if (rows.length > 0) throw conflict('Esse link personalizado já está em uso por outro GDV.');
}

router.get('/', requireAuth, requirePermission('gdv.view'), async (req, res, next) => {
  try {
    const rows = await listRows();
    const visible = hasPermission(req.user, 'gdv.view.all') || hasPermission(req.user, 'gdv.manage')
      ? rows
      : rows.filter((row) => row.owner_user_id && row.owner_user_id === req.user.id);
    res.json({ gdvs: visible.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requirePermission('gdv.manage'), async (req, res, next) => {
  try {
    await ensureGdvSchema();
    const cleanName = String(req.body?.name || '').trim();
    if (!cleanName) throw badRequest('Informe o nome do GDV');

    const owner = await validateOwner(req.body?.ownerUserId);
    const cleanLogo = normalizeLogo(req.body?.logoUrl);
    const customSlug = normalizeCustomSlug(req.body?.customSlug);

    const dup = await query('SELECT id FROM gdvs WHERE name = ? LIMIT 1', [cleanName]);
    if (dup.length > 0) throw conflict('Já existe um GDV com esse nome');
    await ensureUniqueCustomSlug(customSlug);

    const id = uuid();
    await query(
      'INSERT INTO gdvs (id, name, owner_user_id, active, logo_data_url, custom_slug) VALUES (?, ?, ?, ?, ?, ?)',
      [id, cleanName, owner?.id || null, owner ? 1 : 0, cleanLogo || null, customSlug || null]
    );

    await writeAuditLog({
      actor: req.user,
      action: 'gdv.create',
      entityType: 'gdv',
      entityId: id,
      entityLabel: cleanName,
      summary: `GDV ${cleanName} criado`,
      metadata: { ownerUserId: owner?.id || null, customSlug: customSlug || null },
    });

    const rows = await listRows();
    res.status(201).json({ gdv: serialize(rows.find((row) => row.id === id)) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, requirePermission('gdv.manage'), async (req, res, next) => {
  try {
    await ensureGdvSchema();
    const { id } = req.params;
    const currentRows = await query('SELECT * FROM gdvs WHERE id = ? LIMIT 1', [id]);
    const current = currentRows[0];
    if (!current) throw notFound('GDV não encontrado');

    const nextName = req.body?.name != null ? String(req.body.name).trim() : current.name;
    if (!nextName) throw badRequest('Informe o nome do GDV');

    const nextLogo = req.body?.logoUrl !== undefined
      ? normalizeLogo(req.body.logoUrl)
      : (current.logo_data_url || '');
    const nextCustomSlug = req.body?.customSlug !== undefined
      ? normalizeCustomSlug(req.body.customSlug)
      : (current.custom_slug || '');

    const owner = req.body?.ownerUserId !== undefined
      ? await validateOwner(req.body.ownerUserId)
      : null;
    const ownerUserId = req.body?.ownerUserId !== undefined
      ? owner?.id || null
      : current.owner_user_id || null;
    const active = ownerUserId ? 1 : 0;

    const dup = await query('SELECT id FROM gdvs WHERE name = ? AND id <> ? LIMIT 1', [nextName, id]);
    if (dup.length > 0) throw conflict('Já existe um GDV com esse nome');
    await ensureUniqueCustomSlug(nextCustomSlug, id);

    await withTransaction(async (conn) => {
      await conn.query(
        'UPDATE gdvs SET name = ?, owner_user_id = ?, active = ?, logo_data_url = ?, custom_slug = ? WHERE id = ?',
        [nextName, ownerUserId, active, nextLogo || null, nextCustomSlug || null, id]
      );
      if (nextName !== current.name) {
        await conn.query('UPDATE clients SET gdv_name = ? WHERE gdv_name = ?', [nextName, current.name]);
      }
    });

    await writeAuditLog({
      actor: req.user,
      action: 'gdv.update',
      entityType: 'gdv',
      entityId: id,
      entityLabel: nextName,
      summary: `GDV ${nextName} atualizado`,
      metadata: {
        previousName: current.name,
        ownerUserId,
        customSlug: nextCustomSlug || null,
      },
    });

    const rows = await listRows();
    res.json({ gdv: serialize(rows.find((row) => row.id === id)) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requirePermission('gdv.manage'), async (req, res, next) => {
  try {
    await ensureGdvSchema();
    const rows = await query('SELECT id, name FROM gdvs WHERE id = ? LIMIT 1', [req.params.id]);
    const current = rows[0];
    if (!current) throw notFound('GDV não encontrado');

    await writeAuditLog({
      actor: req.user,
      action: 'gdv.delete',
      entityType: 'gdv',
      entityId: current.id,
      entityLabel: current.name,
      summary: 'GDV removido da estrutura',
    });
    await query('DELETE FROM gdvs WHERE id = ?', [current.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
