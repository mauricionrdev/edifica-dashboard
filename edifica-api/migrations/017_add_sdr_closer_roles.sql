-- ==============================================================
--  v124 — Cargos comerciais
--  Adiciona SDR e Closer ao ENUM de usuários.
-- ==============================================================

ALTER TABLE users
  MODIFY COLUMN role ENUM('ceo','suporte_tecnologia','admin','cap','gestor','gdv','sdr','closer') NOT NULL DEFAULT 'gestor';
