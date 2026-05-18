-- ================================================================
-- 015_metric_campaigns
-- Campanhas adicionais por cliente na tela Preencher Semana.
-- Mantém persistência em produção, compartilhada por toda a equipe.
-- ================================================================

ALTER TABLE weekly_metrics
  MODIFY COLUMN period_key VARCHAR(96) NOT NULL;

CREATE TABLE IF NOT EXISTS metric_campaigns (
  id CHAR(36) NOT NULL,
  client_id CHAR(36) NOT NULL,
  base_period_key VARCHAR(16) NOT NULL,
  metric_period_key VARCHAR(96) NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_metric_campaign_metric_period (client_id, metric_period_key),
  KEY idx_metric_campaign_client_period (client_id, base_period_key),
  KEY idx_metric_campaign_created_by (created_by),
  CONSTRAINT fk_metric_campaign_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_metric_campaign_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
