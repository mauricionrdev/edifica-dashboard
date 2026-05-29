-- Remove vínculos técnicos de criador em tarefas de projeto.
-- O criador continua como owner/member do projeto e mantém acesso pelo projeto,
-- mas deixa de aparecer como colaborador real em todas as tarefas geradas.
DELETE tc
  FROM task_collaborators tc
  JOIN tasks t ON t.id = tc.task_id
 WHERE tc.role = 'creator'
   AND t.project_id IS NOT NULL;
