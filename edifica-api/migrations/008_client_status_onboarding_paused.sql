-- Adds operational client statuses used by the dashboard and CAP/GDV views.
-- active: counts in goals, forecasts, wallet and weekly filling.
-- onboarding/paused/churn: visible in Clients, but do not count in operational metrics.

ALTER TABLE clients
  MODIFY COLUMN status ENUM('active','onboarding','paused','churn') NOT NULL DEFAULT 'active';
