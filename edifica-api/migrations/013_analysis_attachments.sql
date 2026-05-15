-- 013_analysis_attachments.sql
-- Anexos de imagem/PDF para Análise ICP, Análise GDV e Resumo de Rotas.

CREATE TABLE IF NOT EXISTS analysis_attachments (
  id VARCHAR(64) PRIMARY KEY,
  analysis_id VARCHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes INT NOT NULL DEFAULT 0,
  data_url LONGTEXT NOT NULL,
  created_by_user_id VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_analysis_attachments_analysis (analysis_id),
  CONSTRAINT fk_analysis_attachments_analysis FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE,
  CONSTRAINT fk_analysis_attachments_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
