-- ================================================================
-- 009_ranking_settings.sql
-- Configuração persistida do cálculo do Ranking de Squads.
-- ================================================================

CREATE TABLE IF NOT EXISTS ranking_settings (
  id VARCHAR(32) NOT NULL,
  goal_percent DECIMAL(5,2) NOT NULL DEFAULT 80.00,
  churn_target DECIMAL(5,2) NOT NULL DEFAULT 8.00,
  updated_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ranking_settings_updated_by (updated_by),
  CONSTRAINT fk_ranking_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ranking_settings (id, goal_percent, churn_target)
VALUES ('default', 80.00, 8.00)
ON DUPLICATE KEY UPDATE id = id;
