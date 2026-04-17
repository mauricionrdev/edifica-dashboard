// ==============================================================
//  /api/squads
//  - GET     público (qualquer usuário autenticado)
//  - POST/PUT/DELETE  admin only
// ==============================================================
import { Router } from 'express';
import { query } from '../db/pool.js';
import {
  uuid,
  badRequest,
  notFound,
  conflict,
} from '../utils/helpers.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT id, name, created_at, updated_at FROM squads ORDER BY name ASC'
    );
    res.json({
      squads: rows.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    const clean = String(name || '').trim();
    if (!clean) throw badRequest('Informe o nome do squad');

    const dup = await query('SELECT id FROM squads WHERE name = ? LIMIT 1', [clean]);
    if (dup.length > 0) throw conflict('Já existe um squad com esse nome');

    const id = uuid();
    await query('INSERT INTO squads (id, name) VALUES (?, ?)', [id, clean]);
    res.status(201).json({ squad: { id, name: clean } });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body || {};
    const clean = String(name || '').trim();
    if (!clean) throw badRequest('Informe o novo nome');

    const rows = await query('SELECT id FROM squads WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) throw notFound('Squad não encontrado');

    const dup = await query(
      'SELECT id FROM squads WHERE name = ? AND id <> ? LIMIT 1',
      [clean, id]
    );
    if (dup.length > 0) throw conflict('Já existe um squad com esse nome');

    await query('UPDATE squads SET name = ? WHERE id = ?', [clean, id]);
    res.json({ squad: { id, name: clean } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT id FROM squads WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) throw notFound('Squad não encontrado');

    // Clientes do squad ficam com squad_id = NULL (FK ON DELETE SET NULL).
    await query('DELETE FROM squads WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
