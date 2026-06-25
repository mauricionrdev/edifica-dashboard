-- Adiciona o status Finalizado para contratos concluídos sem churn.
ALTER TABLE clients
  MODIFY COLUMN status ENUM('active','onboarding','rampagem_comercial','paused','churn','finished') NOT NULL DEFAULT 'active';
