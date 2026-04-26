-- ==============================================================
--  Projetos e tarefas reais
--  Mantem onboardings legados intactos e cria a base estilo Asana.
-- ==============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS projects (
  id                 CHAR(36) NOT NULL,
  name               VARCHAR(200) NOT NULL,
  description        TEXT NULL,
  type               ENUM('client','manual') NOT NULL DEFAULT 'manual',
  status             ENUM('active','archived') NOT NULL DEFAULT 'active',
  client_id          CHAR(36) NULL,
  squad_id           CHAR(36) NULL,
  owner_user_id      CHAR(36) NULL,
  created_by_user_id CHAR(36) NULL,
  source             VARCHAR(80) NULL,
  source_id          VARCHAR(128) NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at        DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_projects_client (client_id),
  KEY idx_projects_type_status (type, status),
  KEY idx_projects_squad (squad_id),
  KEY idx_projects_owner (owner_user_id),
  CONSTRAINT fk_projects_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_projects_squad
    FOREIGN KEY (squad_id) REFERENCES squads(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_projects_owner
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_projects_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_members (
  project_id CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  role       ENUM('owner','member','viewer') NOT NULL DEFAULT 'member',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  KEY idx_project_members_user (user_id),
  CONSTRAINT fk_project_members_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_project_members_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_sections (
  id         CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  name       VARCHAR(200) NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  source     VARCHAR(80) NULL,
  source_id  VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_project_sections_project (project_id, position),
  CONSTRAINT fk_project_sections_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id                    CHAR(36) NOT NULL,
  project_id            CHAR(36) NULL,
  section_id            CHAR(36) NULL,
  client_id             CHAR(36) NULL,
  parent_task_id        CHAR(36) NULL,
  title                 VARCHAR(240) NOT NULL,
  description           MEDIUMTEXT NULL,
  status                ENUM('todo','in_progress','done','canceled') NOT NULL DEFAULT 'todo',
  priority              ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  assignee_user_id      CHAR(36) NULL,
  created_by_user_id    CHAR(36) NULL,
  completed_by_user_id  CHAR(36) NULL,
  due_date              DATE NULL,
  completed_at          DATETIME NULL,
  position              INT NOT NULL DEFAULT 0,
  source                VARCHAR(80) NULL,
  source_id             VARCHAR(160) NULL,
  metadata_json         JSON NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_project_section (project_id, section_id, position),
  KEY idx_tasks_assignee_status_due (assignee_user_id, status, due_date),
  KEY idx_tasks_client (client_id),
  KEY idx_tasks_parent (parent_task_id),
  CONSTRAINT fk_tasks_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_tasks_section
    FOREIGN KEY (section_id) REFERENCES project_sections(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_tasks_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_tasks_parent
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_tasks_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_tasks_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_tasks_completed_by
    FOREIGN KEY (completed_by_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_collaborators (
  task_id    CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  role       ENUM('creator','follower') NOT NULL DEFAULT 'follower',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, user_id),
  KEY idx_task_collaborators_user (user_id),
  CONSTRAINT fk_task_collaborators_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_task_collaborators_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_comments (
  id         CHAR(36) NOT NULL,
  task_id    CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  body       MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_task_comments_task (task_id, created_at),
  CONSTRAINT fk_task_comments_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_task_comments_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_events (
  id            CHAR(36) NOT NULL,
  task_id       CHAR(36) NULL,
  project_id    CHAR(36) NULL,
  actor_user_id CHAR(36) NULL,
  event_type    VARCHAR(80) NOT NULL,
  summary       VARCHAR(255) NOT NULL,
  metadata_json JSON NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_task_events_task (task_id, created_at),
  KEY idx_task_events_project (project_id, created_at),
  CONSTRAINT fk_task_events_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_task_events_project
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_task_events_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
