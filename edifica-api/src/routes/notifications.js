import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotificationStream,
} from '../utils/notifications.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const status = String(req.query.status || 'all');
    const limit = Number(req.query.limit) || 40;
    const notifications = await listNotifications(req.user.id, { status, limit });
    const unreadCount = await countUnreadNotifications(req.user.id);
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const unreadCount = await countUnreadNotifications(req.user.id);
    res.json({ unreadCount });
  } catch (err) {
    next(err);
  }
});

router.get('/stream', async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const unsubscribe = subscribeNotificationStream(req.user.id, res);
    const unreadCount = await countUnreadNotifications(req.user.id);
    res.write(`event: notifications.changed\n`);
    res.write(`data: ${JSON.stringify({ unreadCount, ts: new Date().toISOString() })}\n\n`);

    const ping = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) {
        res.write(`event: ping\n`);
        res.write(`data: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await markNotificationRead(req.user.id, req.params.id);
    const unreadCount = await countUnreadNotifications(req.user.id);
    res.json({ ok: true, unreadCount });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await markAllNotificationsRead(req.user.id);
    res.json({ ok: true, unreadCount: 0 });
  } catch (err) {
    next(err);
  }
});

export default router;
