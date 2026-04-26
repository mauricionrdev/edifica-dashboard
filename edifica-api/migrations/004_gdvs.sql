CREATE TABLE IF NOT EXISTS gdvs (
  id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  owner_user_id CHAR(36) NULL,
  active TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_gdvs_name (name),
  KEY idx_gdvs_owner (owner_user_id),
  CONSTRAINT fk_gdvs_owner
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gdvs (id, name, owner_user_id, active)
SELECT UUID(), u.name, u.id, 1
  FROM users u
 WHERE u.active = 1
   AND u.role = 'gdv';

INSERT IGNORE INTO gdvs (id, name, owner_user_id, active)
SELECT UUID(), c.gdv_name, NULL, 0
  FROM clients c
 WHERE TRIM(c.gdv_name) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM gdvs g WHERE g.name = c.gdv_name
   );
