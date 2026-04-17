// ==============================================================
//  /api/clients
//  Regras:
//   - Ao criar, instancia o onboarding a partir do Modelo Oficial
//     (ou do template embutido se ainda não existir registro singleton).
//   - Atualizar status=churn seta churn_date automaticamente.
//   - goal_status é campo derivado mas persistido; atualizado pela
//     rota de métricas. Esta rota nunca o sobrescreve diretamente.
// ==============================================================
import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import {
  uuid,
  parseJson,
  toDateString,
  fromClientDate,
  badRequest,
  notFound,
  forbidden,
} from '../utils/helpers.js';
import {
  ONBOARDING_TEMPLATE,
  instantiateOnboarding,
} from '../utils/domain.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// --------------------------------------------------------------
//  Serializers
// --------------------------------------------------------------
function serializeClient(row) {
  return {
    id: row.id,
    name: row.name,
    squadId: row.squad_id,
    squadName: row.squad_name ?? null, // vem do JOIN quando disponível
    gdvName: row.gdv_name || '',
    gestor: row.gestor || '',
    status: row.status,
    goalStatus: row.goal_status || '',
    fee: Number(row.fee) || 0,
    metaLucro: Number(row.meta_lucro) || 0,
    startDate: toDateString(row.start_date),
    endDate: toDateString(row.end_date),
    churnDate: toDateString(row.churn_date),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pickUpdatableFields(body) {
  const allowed = [
    'name',
    'squadId',
    'gdvName',
    'gestor',
    'status',
    'fee',
    'metaLucro',
    'startDate',
    'endDate',
  ];
  const fields = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) fields[k] = body[k];
  }
  return fields;
}

function filterBySquadAccess(user, rows) {
  // Admin/master vê tudo.
  if (user.role === 'admin' || user.isMaster) return rows;
  // Usuários com squads declarados veem apenas os clientes desses squads
  // (e clientes sem squad ficam invisíveis por padrão para não-admin).
  const allowedSquads = user.squads || [];
  if (allowedSquads.length === 0) return rows;
  return rows.filter(
    (r) => r.squad_id && allowedSquads.includes(r.squad_id)
  );
}

// --------------------------------------------------------------
//  GET /api/clients
// --------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT c.*, s.name AS squad_name
         FROM clients c
         LEFT JOIN squads s ON s.id = c.squad_id
        ORDER BY c.created_at DESC, c.name ASC`
    );
    const visible = filterBySquadAccess(req.user, rows);
    res.json({ clients: visible.map(serializeClient) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  GET /api/clients/:id
// --------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT c.*, s.name AS squad_name
         FROM clients c
         LEFT JOIN squads s ON s.id = c.squad_id
        WHERE c.id = ?
        LIMIT 1`,
      [req.params.id]
    );
    const row = rows[0];
    if (!row) throw notFound('Cliente não encontrado');

    const accessible = filterBySquadAccess(req.user, [row]);
    if (accessible.length === 0) throw forbidden('Sem acesso a este cliente');

    res.json({ client: serializeClient(row) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  POST /api/clients
//  Cria cliente + onboarding inicial a partir do Modelo Oficial.
// --------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const fields = pickUpdatableFields(req.body || {});
    const name = String(fields.name || '').trim();
    if (!name) throw badRequest('Informe o nome do cliente');

    const id = uuid();
    const status = fields.status === 'churn' ? 'churn' : 'active';
    const churnDate = status === 'churn' ? toDateString(new Date()) : null;

    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO clients (
           id, name, squad_id, gdv_name, gestor, status, goal_status,
           fee, meta_lucro, start_date, end_date, churn_date
         ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          fields.squadId || null,
          String(fields.gdvName || ''),
          String(fields.gestor || ''),
          status,
          Number(fields.fee) || 0,
          Number(fields.metaLucro) || 0,
          fromClientDate(fields.startDate),
          fromClientDate(fields.endDate),
          churnDate,
        ]
      );

      // Carrega template singleton OU cai no template embutido.
      const [tplRows] = await conn.query(
        'SELECT sections FROM onboarding_template WHERE id = 1 LIMIT 1'
      );
      const baseSections =
        tplRows.length > 0
          ? parseJson(tplRows[0].sections, ONBOARDING_TEMPLATE)
          : ONBOARDING_TEMPLATE;

      const sections = instantiateOnboarding(baseSections, {
        gestor: fields.gestor || '',
        gdv: fields.gdvName || '',
      });

      await conn.query(
        `INSERT INTO onboardings (client_id, sections)
         VALUES (?, CAST(? AS JSON))`,
        [id, JSON.stringify(sections)]
      );
    });

    const rows = await query(
      `SELECT c.*, s.name AS squad_name
         FROM clients c
         LEFT JOIN squads s ON s.id = c.squad_id
        WHERE c.id = ? LIMIT 1`,
      [id]
    );
    res.status(201).json({ client: serializeClient(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  PUT /api/clients/:id
// --------------------------------------------------------------
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM clients WHERE id = ? LIMIT 1', [id]);
    const current = existing[0];
    if (!current) throw notFound('Cliente não encontrado');

    const fields = pickUpdatableFields(req.body || {});
    const updates = [];
    const params = [];

    if (fields.name !== undefined) {
      const v = String(fields.name).trim();
      if (!v) throw badRequest('Nome não pode ser vazio');
      updates.push('name = ?');
      params.push(v);
    }
    if (fields.squadId !== undefined) {
      updates.push('squad_id = ?');
      params.push(fields.squadId || null);
    }
    if (fields.gdvName !== undefined) {
      updates.push('gdv_name = ?');
      params.push(String(fields.gdvName || ''));
    }
    if (fields.gestor !== undefined) {
      updates.push('gestor = ?');
      params.push(String(fields.gestor || ''));
    }
    if (fields.status !== undefined) {
      const nextStatus = fields.status === 'churn' ? 'churn' : 'active';
      updates.push('status = ?');
      params.push(nextStatus);

      // Transição active -> churn marca churn_date; churn -> active limpa.
      if (nextStatus === 'churn' && current.status !== 'churn') {
        updates.push('churn_date = ?');
        params.push(toDateString(new Date()));
      } else if (nextStatus === 'active' && current.status === 'churn') {
        updates.push('churn_date = ?');
        params.push(null);
      }
    }
    if (fields.fee !== undefined) {
      updates.push('fee = ?');
      params.push(Number(fields.fee) || 0);
    }
    if (fields.metaLucro !== undefined) {
      updates.push('meta_lucro = ?');
      params.push(Number(fields.metaLucro) || 0);
    }
    if (fields.startDate !== undefined) {
      updates.push('start_date = ?');
      params.push(fromClientDate(fields.startDate));
    }
    if (fields.endDate !== undefined) {
      updates.push('end_date = ?');
      params.push(fromClientDate(fields.endDate));
    }

    if (updates.length > 0) {
      params.push(id);
      await query(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const rows = await query(
      `SELECT c.*, s.name AS squad_name
         FROM clients c
         LEFT JOIN squads s ON s.id = c.squad_id
        WHERE c.id = ? LIMIT 1`,
      [id]
    );
    res.json({ client: serializeClient(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
//  DELETE /api/clients/:id   (admin only)
// --------------------------------------------------------------
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT id FROM clients WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) throw notFound('Cliente não encontrado');

    // FK ON DELETE CASCADE cuida de onboardings, weekly_metrics e analyses.
    await query('DELETE FROM clients WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
