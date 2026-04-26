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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
