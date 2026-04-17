-- ==============================================================
--  Edifica - Schema inicial
--  MySQL 8.0+ (usa CHAR(36) para UUID e JSON nativo)
-- ==============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- --------------------------------------------------------------
--  squads
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS squads (
  id          CHAR(36)     NOT NULL,
  name        VARCHAR(120) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_squads_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
--  users
--  role: admin | cap | gestor | gdv
--  squads: JSON array de ids (CHAR(36)) aos quais o user tem acesso.
--  Array vazio para admins significa acesso a todos.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             CHAR(36)     NOT NULL,
  name           VARCHAR(160) NOT NULL,
  email          VARCHAR(190) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('admin','cap','gestor','gdv') NOT NULL DEFAULT 'gestor',
  is_master      TINYINT(1)   NOT NULL DEFAULT 0,
  squads         JSON         NOT NULL,
  active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
--  clients
--  goal_status: '' | 'vai' | 'nao'  (calculado a partir das semanas,
--    mas persistido para ordenar listas rapidamente)
--  status: 'active' | 'churn'
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id           CHAR(36)     NOT NULL,
  name         VARCHAR(200) NOT NULL,
  squad_id     CHAR(36)     NULL,
  gdv_name     VARCHAR(160) NOT NULL DEFAULT '',
  gestor       VARCHAR(160) NOT NULL DEFAULT '',
  status       ENUM('active','churn') NOT NULL DEFAULT 'active',
  goal_status  ENUM('','vai','nao') NOT NULL DEFAULT '',
  fee          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  meta_lucro   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  start_date   DATE         NULL,
  end_date     DATE         NULL,
  churn_date   DATE         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_clients_squad (squad_id),
  KEY idx_clients_status (status),
  CONSTRAINT fk_clients_squad
    FOREIGN KEY (squad_id) REFERENCES squads(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
--  weekly_metrics
--  period_key formato: 'YYYY-MM-Sw'  ex: '2026-04-S2'
--  data guarda o payload completo de métricas da semana.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_metrics (
  id           CHAR(36)     NOT NULL,
  client_id    CHAR(36)     NOT NULL,
  period_key   VARCHAR(16)  NOT NULL,
  data         JSON         NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_metrics_client_period (client_id, period_key),
  KEY idx_metrics_period (period_key),
  CONSTRAINT fk_metrics_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
--  onboardings  (1 por cliente, singleton)
--  sections: JSON com todas as seções e tasks
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboardings (
  client_id  CHAR(36)   NOT NULL,
  sections   JSON       NOT NULL,
  created_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id),
  CONSTRAINT fk_onboardings_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
--  analyses
--  type: 'icp' | 'gdvanalise'
--  Vários registros por (client, type) - cada um é uma entrada datada.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analyses (
  id           CHAR(36)     NOT NULL,
  client_id    CHAR(36)     NOT NULL,
  type         ENUM('icp','gdvanalise') NOT NULL,
  entry_date   DATE         NOT NULL,
  text         MEDIUMTEXT   NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_analyses_client_type (client_id, type, entry_date),
  CONSTRAINT fk_analyses_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
--  template  (Modelo Oficial de onboarding, singleton)
--  Linha única com id = 1.
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_template (
  id         TINYINT    NOT NULL DEFAULT 1,
  sections   JSON       NOT NULL,
  updated_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
