-- Adiciona o status operacional de Rampagem Comercial.
ALTER TABLE clients
  MODIFY COLUMN status ENUM('active','onboarding','rampagem_comercial','paused','churn') NOT NULL DEFAULT 'active';
