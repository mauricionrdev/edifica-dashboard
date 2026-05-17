import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  getOpenAIProjects,
  getOpenAIUsageReport,
  syncOpenAIProjects,
} from '../services/openaiUsageService.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('audit.view'));

router.get('/report', async (req, res, next) => {
  try {
    const report = await getOpenAIUsageReport({
      start: req.query.start,
      end: req.query.end,
      force: req.query.force === '1' || req.query.force === 'true',
      userId: req.user?.id || null,
    });

    res.json({ report });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const report = await getOpenAIUsageReport({
      start: req.body?.start || req.query.start,
      end: req.body?.end || req.query.end,
      force: true,
      userId: req.user?.id || null,
    });

    res.json({ report });
  } catch (err) {
    next(err);
  }
});

router.get('/projects', async (req, res, next) => {
  try {
    const projects = await getOpenAIProjects();
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

router.post('/sync-projects', async (req, res, next) => {
  try {
    const projects = await syncOpenAIProjects();
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

export default router;
