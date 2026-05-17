-- 014_openai_usage.sql
-- Estrutura de produção para relatório de uso OpenAI.
-- Fonte primária: OpenAI Admin API.
-- Não depende da tabela clients da Edifica.

CREATE TABLE IF NOT EXISTS openai_project_aliases (
  id VARCHAR(80) NOT NULL,
  openai_project_id VARCHAR(100) NOT NULL,
  openai_project_name VARCHAR(220) NOT NULL,
  display_name VARCHAR(220) NULL,
  project_type ENUM('project','legacy','internal') NOT NULL DEFAULT 'project',
  active TINYINT(1) NOT NULL DEFAULT 1,
  source ENUM('openai','manual','csv') NOT NULL DEFAULT 'openai',
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_openai_project_aliases_project_id (openai_project_id),
  KEY idx_openai_project_aliases_active (active),
  KEY idx_openai_project_aliases_type (project_type),
  KEY idx_openai_project_aliases_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS openai_usage_snapshots (
  id VARCHAR(80) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  cache_key VARCHAR(180) NOT NULL,
  payload_json JSON NOT NULL,
  source ENUM('openai','fallback') NOT NULL DEFAULT 'openai',
  forced TINYINT(1) NOT NULL DEFAULT 0,
  refreshed_by_user_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_openai_usage_snapshots_cache_key (cache_key),
  KEY idx_openai_usage_snapshots_period (period_start, period_end),
  KEY idx_openai_usage_snapshots_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
