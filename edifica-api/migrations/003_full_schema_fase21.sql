-- ==============================================================
--  Edifica - Schema completo atualizado (Fase 21)
--  Objetivo: importar uma base nova já no estado atual do projeto,
--  sem depender de rodar a migration inicial + upgrades separados.
--
--  Compatibilidade: MySQL 8.0+
--  Observação: este arquivo cria a estrutura completa do banco.
--  Para criar usuário admin master, squads padrão e template inicial,
--  rode depois o script de seed da aplicação.
-- ==============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------------------------------------------
-- Limpeza opcional para importação de base nova completa
-- --------------------------------------------------------------
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS access_requests;
DROP TABLE IF EXISTS analyses;
DROP TABLE IF EXISTS weekly_metrics;
DROP TABLE IF EXISTS onboardings;
DROP TABLE IF EXISTS onboarding_template;
DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS squads;

SET FOREIGN_KEY_CHECKS = 1;

-- --------------------------------------------------------------
-- squads
-- --------------------------------------------------------------
CREATE TABLE squads (
  id          CHAR(36)     NOT NULL,
  name        VARCHAR(120) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_squads_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
-- users
-- role persistido no banco:
--   ceo | suporte_tecnologia | admin | cap | gestor | gdv
-- Na UI, "gestor" pode ser exibido como "Gestor de Tráfego".
-- squads: JSON array de ids de squads.
-- permissions_override: permissões complementares por usuário.
-- --------------------------------------------------------------
CREATE TABLE users (
  id                    CHAR(36)     NOT NULL,
  name                  VARCHAR(160) NOT NULL,
  email                 VARCHAR(190) NOT NULL,
  phone                 VARCHAR(32)  NULL,
  password_hash         VARCHAR(255) NOT NULL,
  role                  ENUM('ceo','suporte_tecnologia','admin','cap','gestor','gdv') NOT NULL DEFAULT 'gestor',
  is_master             TINYINT(1)   NOT NULL DEFAULT 0,
  squads                JSON         NOT NULL,
  permissions_override  JSON         NULL,
  avatar_color          VARCHAR(32)  NOT NULL DEFAULT 'amber',
  active                TINYINT(1)   NOT NULL DEFAULT 1,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
-- clients
-- goal_status: '' | 'vai' | 'nao'
-- status: 'active' | 'onboarding' | 'paused' | 'churn'
-- --------------------------------------------------------------
CREATE TABLE clients (
  id           CHAR(36)      NOT NULL,
  name         VARCHAR(200)  NOT NULL,
  squad_id     CHAR(36)      NULL,
  gdv_name     VARCHAR(160)  NOT NULL DEFAULT '',
  gestor       VARCHAR(160)  NOT NULL DEFAULT '',
  status       ENUM('active','onboarding','paused','churn') NOT NULL DEFAULT 'active',
  goal_status  ENUM('','vai','nao') NOT NULL DEFAULT '',
  fee          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  meta_lucro   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  start_date   DATE          NULL,
  end_date     DATE          NULL,
  churn_date   DATE          NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_clients_squad (squad_id),
  KEY idx_clients_status (status),
  KEY idx_clients_goal_status (goal_status),
  CONSTRAINT fk_clients_squad
    FOREIGN KEY (squad_id) REFERENCES squads(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
-- weekly_metrics
-- period_key formato: YYYY-MM-S1 ... YYYY-MM-S4
-- data: payload JSON completo da semana.
-- --------------------------------------------------------------
CREATE TABLE weekly_metrics (
  id           CHAR(36)     NOT NULL,
  client_id    CHAR(36)     NOT NULL,
  period_key   VARCHAR(16)  NOT NULL,
  data         JSON         NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_metrics_client_period (client_id, period_key),
  KEY idx_metrics_period (period_key),
  KEY idx_metrics_client (client_id),
  CONSTRAINT fk_metrics_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
-- onboardings
-- sections: JSON com seções e tarefas.
-- Tarefas suportam, entre outros, campos como:
-- responsible, assigneeId, status, priority, completedAt, note.
-- --------------------------------------------------------------
CREATE TABLE onboardings (
  client_id    CHAR(36)   NOT NULL,
  sections     JSON       NOT NULL,
  created_at   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id),
  CONSTRAINT fk_onboardings_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
-- analyses
-- type: 'icp' | 'gdvanalise'
-- --------------------------------------------------------------
CREATE TABLE analyses (
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
-- onboarding_template (Modelo Oficial)
-- singleton com id = 1
-- --------------------------------------------------------------
CREATE TABLE onboarding_template (
  id          TINYINT      NOT NULL DEFAULT 1,
  sections    JSON         NOT NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
-- access_requests
-- solicitações de convite de acesso e redefinição de senha
-- --------------------------------------------------------------
CREATE TABLE access_requests (
  id                    VARCHAR(64)  NOT NULL,
  type                  VARCHAR(16)  NOT NULL,
  status                VARCHAR(16)  NOT NULL DEFAULT 'pending',
  requester_name        VARCHAR(160) NULL,
  requester_email       VARCHAR(190) NULL,
  requester_identifier  VARCHAR(190) NULL,
  company               VARCHAR(190) NULL,
  note                  TEXT         NULL,
  resolution_note       TEXT         NULL,
  resolved_by           VARCHAR(64)  NULL,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_access_requests_status (status),
  KEY idx_access_requests_type (type),
  KEY idx_access_requests_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
-- audit_logs
-- trilha de auditoria administrativa
-- --------------------------------------------------------------
CREATE TABLE audit_logs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id       VARCHAR(64)     NULL,
  actor_name     VARCHAR(160)    NULL,
  actor_email    VARCHAR(190)    NULL,
  action         VARCHAR(80)     NOT NULL,
  entity_type    VARCHAR(80)     NOT NULL,
  entity_id      VARCHAR(128)    NULL,
  entity_label   VARCHAR(190)    NULL,
  summary        VARCHAR(255)    NULL,
  metadata_json  JSON            NULL,
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created_at (created_at),
  KEY idx_audit_action (action),
  KEY idx_audit_entity_type (entity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================
-- Pós-importação recomendado:
-- 1) npm run seed
-- 2) npm run normalize:onboarding   (se importar dados antigos)
-- ==============================================================
