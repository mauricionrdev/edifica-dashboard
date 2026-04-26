-- ==============================================================
--  Edifica - Upgrade do banco original para a estrutura atual
--  Objetivo: levar um banco do primeiro ZIP para o estado da Fase 20+
--  Requer: MySQL 8.0+
-- ==============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- --------------------------------------------------------------
-- users: novos campos de perfil e permissões complementares
-- --------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(32) NULL AFTER email,
  ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(32) NOT NULL DEFAULT 'amber' AFTER phone,
  ADD COLUMN IF NOT EXISTS permissions_override JSON NULL AFTER squads;

-- --------------------------------------------------------------
-- users.role: amplia cargos aceitos pela plataforma atual
-- Observação: o banco mantém 'gestor' como valor persistido.
-- Na UI isso pode ser rotulado como 'Gestor de Tráfego'.
-- --------------------------------------------------------------
ALTER TABLE users
  MODIFY COLUMN role ENUM('ceo','suporte_tecnologia','admin','cap','gestor','gdv') NOT NULL DEFAULT 'gestor';

-- --------------------------------------------------------------
-- access_requests: convites e redefinições solicitadas pelo login
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_requests (
  id VARCHAR(64) PRIMARY KEY,
  type VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  requester_name VARCHAR(160) NULL,
  requester_email VARCHAR(190) NULL,
  requester_identifier VARCHAR(190) NULL,
  company VARCHAR(190) NULL,
  note TEXT NULL,
  resolution_note TEXT NULL,
  resolved_by VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_access_requests_status (status),
  INDEX idx_access_requests_type (type),
  INDEX idx_access_requests_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------
-- audit_logs: trilha de auditoria administrativa
-- --------------------------------------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
