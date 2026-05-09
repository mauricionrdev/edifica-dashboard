ALTER TABLE tasks
  MODIFY priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium';
