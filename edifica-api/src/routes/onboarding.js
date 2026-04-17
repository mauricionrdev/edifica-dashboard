// ==============================================================
//  /api/clients/:clientId/onboarding
//  GET  → seções do onboarding do cliente
//  PUT  → substitui inteiro (o frontend envia o estado consolidado)
//
//  Esta rota está separada das rotas de clients para deixar o
//  domínio claro: "onboarding" é um agregado próprio do cliente.
// ==============================================================
import { Router } from 'express';
import { query } from '../db/pool.js';
import {
  parseJson,
  badRequest,
  notFound,
} from '../utils/helpers.js';
import {
  ONBOARDING_TEMPLATE,
  instantiateOnboarding,
} from '../utils/domain.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function assertClientExists(clientId) {
  const rows = await query('SELECT id, gestor, gdv_name FROM clients WHERE id = ? LIMIT 1', [clientId]);
  if (rows.length === 0) throw notFound('Cliente não encontrado');
  return rows[0];
}

router.get('/:clientId/onboarding', async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const client = await assertClientExists(clientId);

    const rows = await query(
      'SELECT sections, updated_at FROM onboardings WHERE client_id = ? LIMIT 1',
      [clientId]
    );

    if (rows.length === 0) {
      // Sem onboarding ainda (ex.: dado importado legado): gera na hora.
      const sections = instantiateOnboarding(ONBOARDING_TEMPLATE, {
        gestor: client.gestor || '',
        gdv: client.gdv_name || '',
      });
      await query(
        `INSERT INTO onboardings (client_id, sections)
         VALUES (?, CAST(? AS JSON))`,
        [clientId, JSON.stringify(sections)]
      );
      return res.json({ onboarding: { clientId, sections, updatedAt: null } });
    }

    res.json({
      onboarding: {
        clientId,
        sections: parseJson(rows[0].sections, []),
        updatedAt: rows[0].updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:clientId/onboarding', async (req, res, next) => {
  try {
    const { clientId } = req.params;
    await assertClientExists(clientId);

    const { sections } = req.body || {};
    if (!Array.isArray(sections)) {
      throw badRequest('sections deve ser um array');
    }

    await query(
      `INSERT INTO onboardings (client_id, sections)
       VALUES (?, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE sections = VALUES(sections)`,
      [clientId, JSON.stringify(sections)]
    );

    const rows = await query(
      'SELECT sections, updated_at FROM onboardings WHERE client_id = ? LIMIT 1',
      [clientId]
    );
    res.json({
      onboarding: {
        clientId,
        sections: parseJson(rows[0].sections, []),
        updatedAt: rows[0].updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
