// ==============================================================
//  /api/template  (Modelo Oficial de onboarding, singleton id=1)
//
//  GET  /api/template          autenticado
//  PUT  /api/template          admin only   { sections: [...] }
//  POST /api/template/reset    admin only   restaura template padrão
// ==============================================================
import { Router } from 'express';
import { query } from '../db/pool.js';
import { parseJson, badRequest } from '../utils/helpers.js';
import { ONBOARDING_TEMPLATE } from '../utils/domain.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT sections, updated_at FROM onboarding_template WHERE id = 1 LIMIT 1'
    );

    if (rows.length === 0) {
      // Primeiro acesso: persiste o template padrão para que edições subsequentes
      // operem sobre ele.
      await query(
        `INSERT INTO onboarding_template (id, sections)
         VALUES (1, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE sections = VALUES(sections)`,
        [JSON.stringify(ONBOARDING_TEMPLATE)]
      );
      return res.json({
        template: { sections: ONBOARDING_TEMPLATE, updatedAt: null },
      });
    }

    res.json({
      template: {
        sections: parseJson(rows[0].sections, ONBOARDING_TEMPLATE),
        updatedAt: rows[0].updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { sections } = req.body || {};
    if (!Array.isArray(sections)) throw badRequest('sections deve ser um array');

    await query(
      `INSERT INTO onboarding_template (id, sections)
       VALUES (1, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE sections = VALUES(sections)`,
      [JSON.stringify(sections)]
    );

    const rows = await query(
      'SELECT sections, updated_at FROM onboarding_template WHERE id = 1 LIMIT 1'
    );
    res.json({
      template: {
        sections: parseJson(rows[0].sections, []),
        updatedAt: rows[0].updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await query(
      `INSERT INTO onboarding_template (id, sections)
       VALUES (1, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE sections = VALUES(sections)`,
      [JSON.stringify(ONBOARDING_TEMPLATE)]
    );

    const rows = await query(
      'SELECT sections, updated_at FROM onboarding_template WHERE id = 1 LIMIT 1'
    );
    res.json({
      template: {
        sections: parseJson(rows[0].sections, ONBOARDING_TEMPLATE),
        updatedAt: rows[0].updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
