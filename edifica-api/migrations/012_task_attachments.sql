-- Permite prioridade crítica e imagens anexadas em tarefas
ALTER TABLE tasks
  MODIFY priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium';

CREATE TABLE IF NOT EXISTS task_attachments (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  data_url LONGTEXT NOT NULL,
  created_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_attachments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_attachments_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
