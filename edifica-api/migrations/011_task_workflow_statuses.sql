ALTER TABLE tasks
  MODIFY status ENUM(
    'todo',
    'in_progress',
    'activation_gdv',
    'access_delivery',
    'traffic_activation',
    'final_validation',
    'done',
    'canceled'
  ) NOT NULL DEFAULT 'todo';
