import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { badRequest, conflict, notFound, uuid } from '../utils/helpers.js';
import { writeAuditLog } from '../utils/audit.js';
import { hasPermission } from '../utils/permissions.js';

const router = Router();

let schemaPromise = null;

async function ensureSquadSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const cols = await query('SHOW COLUMNS FROM squads');
      const names = new Set(cols.map((col) => col.Field));
      if (!names.has('owner_user_id')) {
        await query('ALTER TABLE squads ADD COLUMN owner_user_id CHAR(36) NULL AFTER name');
      }
      if (!names.has('active')) {
        await query('ALTER TABLE squads ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 0 AFTER owner_user_id');
      }
      if (!names.has('logo_data_url')) {
        await query('ALTER TABLE squads ADD COLUMN logo_data_url MEDIUMTEXT NULL AFTER active');
      }

      const indexes = await query('SHOW INDEX FROM squads');
      const indexNames = new Set(indexes.map((idx) => idx.Key_name));
      if (!indexNames.has('idx_squads_owner')) {
        await query('ALTER TABLE squads ADD INDEX idx_squads_owner (owner_user_id)');
      }
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

async function validateOwner(ownerUserId) {
  const clean = String(ownerUserId || '').trim();
  if (!clean) return null;

  const rows = await query(
    `SELECT id, name, email, role, active
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [clean]
  );
  const owner = rows[0];
  if (!owner || !owner.active) {
    throw badRequest('Selecione um usuário ativo como proprietário do squad.');
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
    clientsCount: Number(row.clients_count) || 0,
    activeClients: Number(row.active_clients) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listRows() {
  await ensureSquadSchema();
  return query(
    `SELECT s.id, s.name, s.owner_user_id, s.active, s.logo_data_url, s.created_at, s.updated_at,
            u.name AS owner_name, u.email AS owner_email, u.role AS owner_role, u.active AS owner_active,
            COUNT(c.id) AS clients_count,
            SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS active_clients
       FROM squads s
       LEFT JOIN users u ON u.id = s.owner_user_id
       LEFT JOIN clients c ON c.squad_id = s.id
      GROUP BY s.id, s.name, s.owner_user_id, s.active, s.logo_data_url, s.created_at, s.updated_at,
               u.name, u.email, u.role, u.active
      ORDER BY s.name ASC`
  );
}

router.get('/', requireAuth, requirePermission('squads.view'), async (req, res, next) => {
  try {
    const rows = await listRows();
    const allowedSquads = Array.isArray(req.user?.squads) ? req.user.squads.filter(Boolean) : [];
    const visible = hasPermission(req.user, 'squads.view.all') || hasPermission(req.user, 'squads.manage')
      ? rows
      : rows.filter((row) => allowedSquads.includes(row.id));
    res.json({ squads: visible.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requirePermission('squads.manage'), async (req, res, next) => {
  try {
    await ensureSquadSchema();
    const clean = String(req.body?.name || '').trim();
    const cleanLogo = String(req.body?.logoUrl || '').trim();
    if (cleanLogo && !cleanLogo.startsWith('data:image/')) throw badRequest('Imagem do squad inválida');
    if (!clean) throw badRequest('Informe o nome do squad');

    const owner = await validateOwner(req.body?.ownerUserId);
    const dup = await query('SELECT id FROM squads WHERE name = ? LIMIT 1', [clean]);
    if (dup.length > 0) throw conflict('Já existe um squad com esse nome');

    const id = uuid();
    await query(
      'INSERT INTO squads (id, name, owner_user_id, active, logo_data_url) VALUES (?, ?, ?, ?, ?)',
      [id, clean, owner?.id || null, owner ? 1 : 0, cleanLogo || null]
    );

    await writeAuditLog({
      actor: req.user,
      action: 'squad.create',
      entityType: 'squad',
      entityId: id,
      entityLabel: clean,
      summary: `Squad ${clean} criado`,
      metadata: { ownerUserId: owner?.id || null },
    });

    const rows = await listRows();
    res.status(201).json({ squad: serialize(rows.find((row) => row.id === id)) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, requirePermission('squads.manage'), async (req, res, next) => {
  try {
    await ensureSquadSchema();
    const { id } = req.params;
    const currentRows = await query('SELECT * FROM squads WHERE id = ? LIMIT 1', [id]);
    const current = currentRows[0];
    if (!current) throw notFound('Squad não encontrado');

    const nextName = req.body?.name != null ? String(req.body.name).trim() : current.name;
    if (!nextName) throw badRequest('Informe o nome do squad');
    const nextLogo = req.body?.logoUrl !== undefined ? String(req.body.logoUrl || '').trim() : current.logo_data_url || '';
    if (nextLogo && !nextLogo.startsWith('data:image/')) throw badRequest('Imagem do squad inválida');

    const owner = req.body?.ownerUserId !== undefined
      ? await validateOwner(req.body.ownerUserId)
      : null;
    const ownerUserId = req.body?.ownerUserId !== undefined
      ? owner?.id || null
      : current.owner_user_id || null;
    const active = ownerUserId ? 1 : 0;

    const dup = await query('SELECT id FROM squads WHERE name = ? AND id <> ? LIMIT 1', [nextName, id]);
    if (dup.length > 0) throw conflict('Já existe um squad com esse nome');

    await query(
      'UPDATE squads SET name = ?, owner_user_id = ?, active = ?, logo_data_url = ? WHERE id = ?',
      [nextName, ownerUserId, active, nextLogo || null, id]
    );

    await writeAuditLog({
      actor: req.user,
      action: 'squad.update',
      entityType: 'squad',
      entityId: id,
      entityLabel: nextName,
      summary: `Squad ${nextName} atualizado`,
      metadata: { ownerUserId },
    });

    const rows = await listRows();
    res.json({ squad: serialize(rows.find((row) => row.id === id)) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requirePermission('squads.manage'), async (req, res, next) => {
  try {
    await ensureSquadSchema();
    const { id } = req.params;
    const rows = await query('SELECT id, name FROM squads WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) throw notFound('Squad não encontrado');

    await writeAuditLog({
      actor: req.user,
      action: 'squad.delete',
      entityType: 'squad',
      entityId: id,
      entityLabel: rows[0].name || id,
      summary: 'Squad removido da estrutura',
    });

    await query('DELETE FROM squads WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
