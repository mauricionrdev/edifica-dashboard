// ==============================================================
//  /api/clients/:clientId/onboarding
//  /api/clients/onboarding/my-tasks
// ==============================================================
import { Router } from 'express';
import { query } from '../db/pool.js';
import { parseJson, badRequest } from '../utils/helpers.js';
import { ONBOARDING_TEMPLATE, instantiateOnboarding } from '../utils/domain.js';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { getAccessibleClientRow, filterRowsBySquadAccess, isAdminUser } from '../utils/access.js';
import { hasPermission } from '../utils/permissions.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function assertClientExists(clientId, user) {
  return getAccessibleClientRow(clientId, user, 'id, name, gestor, gdv_name, squad_id');
}

async function getCurrentTemplateSections() {
  const rows = await query('SELECT sections FROM onboarding_template WHERE id = 1 LIMIT 1');
  return rows.length > 0 ? parseJson(rows[0].sections, ONBOARDING_TEMPLATE) : ONBOARDING_TEMPLATE;
}

async function resolveResponsibleIds(client) {
  const names = [client.gestor, client.gdv_name].map((value) => String(value || '').trim()).filter(Boolean);
  if (names.length === 0) return { gestorId: '', gdvId: '' };

  const rows = await query(
    `SELECT id, name
       FROM users
      WHERE active = 1
        AND LOWER(name) IN (${names.map(() => 'LOWER(?)').join(',')})`,
    names
  );
  const byName = new Map(rows.map((row) => [String(row.name || '').trim().toLowerCase(), row.id]));
  return {
    gestorId: byName.get(String(client.gestor || '').trim().toLowerCase()) || '',
    gdvId: byName.get(String(client.gdv_name || '').trim().toLowerCase()) || '',
  };
}

function serializeTask(section, task, client, sectionIndex, taskIndex) {
  const assigneeId = String(task?.assigneeId || '').trim();
  const assigneeLabel = String(task?.assignee || '').trim();
  return {
    id: `${client.id}:${sectionIndex}:${taskIndex}`,
    clientId: client.id,
    clientName: client.name || 'Cliente',
    squadId: client.squad_id || '',
    section: section?.sec || `Seção ${sectionIndex + 1}`,
    title: String(task?.name || '').trim(),
    notes: String(task?.notes || '').trim(),
    dueDate: String(task?.dueDate || '').trim(),
    priority: String(task?.priority || 'medium').trim(),
    status: String(task?.status || (task?.done ? 'done' : 'todo')).trim(),
    done: Boolean(task?.done),
    completedAt: String(task?.completedAt || '').trim(),
    assigneeId,
    assigneeLabel,
    sectionIndex,
    taskIndex,
  };
}

function matchesTaskAssignee(task, user) {
  const assigneeId = String(task?.assigneeId || '').trim();
  const assigneeLabel = String(task?.assignee || '').trim().toLowerCase();
  if (assigneeId && assigneeId === user.id) return true;
  if (!assigneeLabel) return false;
  return [String(user.name || '').trim().toLowerCase(), String(user.email || '').trim().toLowerCase()].includes(assigneeLabel);
}

router.get('/onboarding/my-tasks', requirePermission('onboarding.view'), async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT c.id, c.name, c.squad_id, o.sections
         FROM onboardings o
         JOIN clients c ON c.id = o.client_id
        ORDER BY c.name ASC`
    );

    const visibleRows = filterRowsBySquadAccess(req.user, rows);
    const tasks = [];
    for (const row of visibleRows) {
      const sections = parseJson(row.sections, []);
      sections.forEach((section, si) => {
        (section?.tasks || []).forEach((task, ti) => {
          if (matchesTaskAssignee(task, req.user)) {
            tasks.push(serializeTask(section, task, row, si, ti));
          }
        });
      });
    }

    tasks.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const aDue = a.dueDate || '9999-99-99';
      const bDue = b.dueDate || '9999-99-99';
      if (aDue !== bDue) return aDue.localeCompare(bDue);
      return a.clientName.localeCompare(b.clientName);
    });

    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});


router.patch(
  '/:clientId/onboarding/task-status',
  requireAnyPermission(['onboarding.complete.own', 'onboarding.complete.any']),
  async (req, res, next) => {
  try {
    const { clientId } = req.params;
    await assertClientExists(clientId, req.user);
    const sectionIndex = Number(req.body?.sectionIndex);
    const taskIndex = Number(req.body?.taskIndex);
    const requestedStatus = String(req.body?.status || '').trim();
    const done = requestedStatus ? requestedStatus === 'done' : Boolean(req.body?.done);
    if (!Number.isInteger(sectionIndex) || !Number.isInteger(taskIndex) || sectionIndex < 0 || taskIndex < 0) {
      throw badRequest('sectionIndex e taskIndex são obrigatórios');
    }

    const rows = await query('SELECT sections FROM onboardings WHERE client_id = ? LIMIT 1', [clientId]);
    const sections = parseJson(rows[0]?.sections, []);
    if (!Array.isArray(sections) || !sections[sectionIndex] || !sections[sectionIndex].tasks?.[taskIndex]) {
      throw badRequest('Tarefa não encontrada');
    }

    const task = sections[sectionIndex].tasks[taskIndex];
    const isOwnTask = matchesTaskAssignee(task, req.user);
    const canCompleteAny = isAdminUser(req.user) || hasPermission(req.user, 'onboarding.complete.any');
    if (!isOwnTask && !canCompleteAny) {
      throw badRequest('Você só pode concluir tarefas designadas para você');
    }

    task.done = done;
    task.status = requestedStatus || (done ? 'done' : 'todo');
    task.completedAt = done ? new Date().toISOString() : '';
    task.completedBy = done ? req.user.id : '';
    await query('UPDATE onboardings SET sections = ? WHERE client_id = ?', [JSON.stringify(sections), clientId]);
    res.json({ ok: true, task });
  } catch (err) {
    next(err);
  }
});

router.get('/:clientId/onboarding', requirePermission('onboarding.view'), async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const client = await assertClientExists(clientId, req.user);

    const rows = await query(
      'SELECT sections, updated_at FROM onboardings WHERE client_id = ? LIMIT 1',
      [clientId]
    );

    if (rows.length === 0) {
      const baseSections = await getCurrentTemplateSections();
      const responsibleIds = await resolveResponsibleIds(client);
      const sections = instantiateOnboarding(baseSections, {
        gestor: client.gestor || '',
        gestorId: responsibleIds.gestorId,
        gdv: client.gdv_name || '',
        gdvId: responsibleIds.gdvId,
      });
      await query(
        `INSERT INTO onboardings (client_id, sections)
         VALUES (?, ?)`,
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

router.put('/:clientId/onboarding', requirePermission('onboarding.edit'), async (req, res, next) => {
  try {
    const { clientId } = req.params;
    await assertClientExists(clientId, req.user);

    const { sections } = req.body || {};
    if (!Array.isArray(sections)) {
      throw badRequest('sections deve ser um array');
    }

    await query(
      `INSERT INTO onboardings (client_id, sections)
       VALUES (?, ?)
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
        sections: parseJson(rows[0]?.sections, []),
        updatedAt: rows[0]?.updated_at || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
