import { query } from '../db/pool.js';
import { parseJson } from './helpers.js';

let initPromise = null;

export async function ensureAuditTable() {
  if (!initPromise) {
    initPromise = query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        actor_id VARCHAR(64) NULL,
        actor_name VARCHAR(160) NULL,
        actor_email VARCHAR(190) NULL,
        action VARCHAR(80) NOT NULL,
        entity_type VARCHAR(80) NOT NULL,
        entity_id VARCHAR(128) NULL,
        entity_label VARCHAR(190) NULL,
        summary VARCHAR(255) NULL,
        metadata_json JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_created_at (created_at),
        INDEX idx_audit_action (action),
        INDEX idx_audit_entity_type (entity_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function writeAuditLog({ actor, action, entityType, entityId = null, entityLabel = null, summary = null, metadata = null }) {
  await ensureAuditTable();
  await query(
    `INSERT INTO audit_logs (
      actor_id, actor_name, actor_email, action, entity_type, entity_id, entity_label, summary, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actor?.id || null,
      actor?.name || null,
      actor?.email || null,
      action,
      entityType,
      entityId,
      entityLabel,
      summary,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

export function serializeAuditLog(row) {
  return {
    id: row.id,
    actorId: row.actor_id || '',
    actorName: row.actor_name || 'Sistema',
    actorEmail: row.actor_email || '',
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id || '',
    entityLabel: row.entity_label || '',
    summary: row.summary || '',
    metadata: parseJson(row.metadata_json, null),
    createdAt: row.created_at,
  };
}
