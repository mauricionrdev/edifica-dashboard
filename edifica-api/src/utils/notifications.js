import { query } from '../db/pool.js';
import { parseJson } from './helpers.js';

let initPromise = null;
const notificationStreams = new Map();

function writeSse(res, event, data = {}) {
  if (!res || res.destroyed || res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function getUserStreams(userId) {
  const key = String(userId || '');
  if (!key) return null;
  if (!notificationStreams.has(key)) notificationStreams.set(key, new Set());
  return notificationStreams.get(key);
}

export function subscribeNotificationStream(userId, res) {
  const streams = getUserStreams(userId);
  if (!streams) return () => {};

  streams.add(res);
  writeSse(res, 'connected', { ok: true, ts: new Date().toISOString() });

  return () => {
    streams.delete(res);
    if (streams.size === 0) notificationStreams.delete(String(userId));
  };
}

export async function emitNotificationsChanged(userIds = []) {
  const recipients = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  await Promise.all(recipients.map(async (userId) => {
    const streams = notificationStreams.get(String(userId));
    if (!streams || streams.size === 0) return;
    const unreadCount = await countUnreadNotifications(userId);
    for (const res of streams) {
      writeSse(res, 'notifications.changed', {
        unreadCount,
        ts: new Date().toISOString(),
      });
    }
  }));
}

export async function ensureNotificationsTable() {
  if (!initPromise) {
    initPromise = query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id CHAR(36) NOT NULL PRIMARY KEY,
        recipient_user_id VARCHAR(64) NOT NULL,
        type VARCHAR(80) NOT NULL,
        level VARCHAR(16) NOT NULL DEFAULT 'info',
        title VARCHAR(180) NOT NULL,
        body VARCHAR(255) NULL,
        entity_type VARCHAR(80) NULL,
        entity_id VARCHAR(128) NULL,
        entity_label VARCHAR(190) NULL,
        action_url VARCHAR(255) NULL,
        metadata_json JSON NULL,
        read_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_recipient_created (recipient_user_id, created_at DESC),
        INDEX idx_notifications_recipient_read (recipient_user_id, read_at),
        INDEX idx_notifications_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function serializeNotification(row) {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    type: row.type,
    level: row.level || 'info',
    title: row.title,
    body: row.body || '',
    entityType: row.entity_type || '',
    entityId: row.entity_id || '',
    entityLabel: row.entity_label || '',
    actionUrl: row.action_url || '',
    metadata: parseJson(row.metadata_json, null),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function listNotifications(recipientUserId, { status = 'all', limit = 40 } = {}) {
  await ensureNotificationsTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const params = [recipientUserId];
  let where = 'WHERE recipient_user_id = ?';
  if (status === 'unread') {
    where += ' AND read_at IS NULL';
  }
  const rows = await query(
    `SELECT *
       FROM notifications
      ${where}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}`,
    params
  );
  return rows.map(serializeNotification);
}

export async function countUnreadNotifications(recipientUserId) {
  await ensureNotificationsTable();
  const rows = await query(
    `SELECT COUNT(*) AS total
       FROM notifications
      WHERE recipient_user_id = ?
        AND read_at IS NULL`,
    [recipientUserId]
  );
  return Number(rows?.[0]?.total || 0);
}

export async function markNotificationRead(recipientUserId, notificationId) {
  await ensureNotificationsTable();
  await query(
    `UPDATE notifications
        SET read_at = COALESCE(read_at, UTC_TIMESTAMP())
      WHERE id = ?
        AND recipient_user_id = ?`,
    [notificationId, recipientUserId]
  );
  await emitNotificationsChanged([recipientUserId]);
}

export async function markAllNotificationsRead(recipientUserId) {
  await ensureNotificationsTable();
  await query(
    `UPDATE notifications
        SET read_at = COALESCE(read_at, UTC_TIMESTAMP())
      WHERE recipient_user_id = ?
        AND read_at IS NULL`,
    [recipientUserId]
  );
  await emitNotificationsChanged([recipientUserId]);
}

export async function notifyUsers({
  ids = [],
  type,
  level = 'info',
  title,
  body = null,
  entityType = null,
  entityId = null,
  entityLabel = null,
  actionUrl = null,
  metadata = null,
}) {
  const recipients = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
  if (!recipients.length || !title || !type) return;

  await ensureNotificationsTable();

  const placeholders = recipients.map(() => '(UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = recipients.flatMap((recipientUserId) => [
    recipientUserId,
    type,
    level,
    String(title).slice(0, 180),
    body ? String(body).slice(0, 255) : null,
    entityType,
    entityId,
    entityLabel ? String(entityLabel).slice(0, 190) : null,
    actionUrl ? String(actionUrl).slice(0, 255) : null,
    metadata ? JSON.stringify(metadata) : null,
  ]);

  await query(
    `INSERT INTO notifications (
      id,
      recipient_user_id,
      type,
      level,
      title,
      body,
      entity_type,
      entity_id,
      entity_label,
      action_url,
      metadata_json
    ) VALUES ${placeholders}`,
    params
  );
  await emitNotificationsChanged(recipients);
}

export async function findAdminRecipientIds() {
  const rows = await query(
    `SELECT id
       FROM users
      WHERE active = 1
        AND (is_master = 1 OR role IN ('admin', 'ceo', 'suporte_tecnologia'))`
  );
  return rows.map((row) => row.id).filter(Boolean);
}

export async function findUserIdsByNames(names = []) {
  const clean = [...new Set((Array.isArray(names) ? names : []).map((item) => String(item || '').trim()).filter(Boolean))];
  if (!clean.length) return [];
  const rows = await query(
    `SELECT id
       FROM users
      WHERE active = 1
        AND LOWER(name) IN (${clean.map(() => 'LOWER(?)').join(',')})`,
    clean
  );
  return rows.map((row) => row.id).filter(Boolean);
}

export async function findSquadOwnerRecipientId(squadId) {
  if (!squadId) return '';
  const rows = await query(
    `SELECT owner_user_id
       FROM squads
      WHERE id = ?
      LIMIT 1`,
    [squadId]
  );
  return rows?.[0]?.owner_user_id || '';
}
