import { useEffect, useMemo, useState } from 'react';
import { listProjects } from '../../api/projects.js';
import { BriefcaseIcon, ChecklistIcon, SearchIcon, ShieldIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import { errorMessage, normalizeText, resolveName, safeInt } from './v2PageUtils.js';
import styles from './V2Operations.module.css';

function projectId(project, index) {
  return project?.id || project?.projectId || project?.project_id || project?.clientId || project?.client_id || project?.name || `project-${index}`;
}

function projectName(project) {
  return resolveName(project?.name || project?.title || project?.projectName || project?.project_name, 'Projeto sem nome');
}

function clientName(project) {
  return resolveName(project?.clientName || project?.client_name || project?.client?.name || project?.client, 'Sem cliente vinculado');
}

function projectStatus(project) {
  return resolveName(project?.statusLabel || project?.status_label || project?.status || project?.stage || 'ativo', 'Status não informado');
}

function projectUpdatedAt(project) {
  const value = project?.updatedAt || project?.updated_at || project?.createdAt || project?.created_at;
  if (!value) return 'Sem data';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function countTasks(project) {
  if (Array.isArray(project?.tasks)) return project.tasks.length;
  return Number(project?.tasksCount ?? project?.taskCount ?? project?.tasks_count ?? project?.totalTasks ?? project?.total_tasks ?? 0) || 0;
}

function countDone(project) {
  if (Array.isArray(project?.tasks)) {
    return project.tasks.filter((task) => ['done', 'completed', 'concluida', 'concluída'].includes(String(task?.status || '').toLowerCase())).length;
  }
  return Number(project?.doneTasks ?? project?.completedTasks ?? project?.completed_tasks ?? project?.done_tasks ?? 0) || 0;
}

function memberCount(project) {
  if (Array.isArray(project?.members)) return project.members.length;
  return Number(project?.membersCount ?? project?.memberCount ?? project?.members_count ?? 0) || 0;
}

function projectHaystack(project) {
  return normalizeText([
    projectName(project),
    clientName(project),
    projectStatus(project),
    project?.ownerName,
    project?.owner_name,
  ].filter(Boolean).join(' '));
}

export default function ProjectsV2Page() {
  const [projects, setProjects] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedProjectKey, setSelectedProjectKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      setLoading(true);
      setError(null);
      try {
        const payload = await listProjects();
        const next = Array.isArray(payload?.projects) ? payload.projects : Array.isArray(payload) ? payload : [];
        if (!cancelled) setProjects(next);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProjects();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const needle = normalizeText(query);
    if (!needle) return projects;
    return projects.filter((project) => projectHaystack(project).includes(needle));
  }, [projects, query]);

  const selectedProject = useMemo(() => {
    if (!filtered.length) return null;
    if (!selectedProjectKey) return filtered[0];
    return filtered.find((project, index) => projectId(project, index) === selectedProjectKey) || filtered[0];
  }, [filtered, selectedProjectKey]);

  const selectedTasks = Array.isArray(selectedProject?.tasks) ? selectedProject.tasks.slice(0, 8) : [];

  const totals = useMemo(() => {
    const totalTasks = projects.reduce((acc, project) => acc + countTasks(project), 0);
    const doneTasks = projects.reduce((acc, project) => acc + countDone(project), 0);
    const activeProjects = projects.filter((project) => !['archived', 'closed', 'finalizado', 'concluido', 'concluído'].includes(String(project?.status || '').toLowerCase())).length;
    return { totalTasks, doneTasks, activeProjects };
  }, [projects]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true"><BriefcaseIcon size={20} /></div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Projetos V2 · rota paralela</p>
          <h1>Leitura segura dos projetos operacionais</h1>
          <p>Consulta os projetos atuais sem criar tarefa, sem alterar quadro e sem substituir a rota oficial de projetos.</p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.toolbar} aria-label="Filtros de Projetos V2">
        <label className={styles.searchBox}>
          <span className={styles.fieldLabel}>Busca</span>
          <SearchIcon size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Projeto, cliente, status ou responsável" />
        </label>
        <span className={styles.statusBadgeMuted}>{loading ? 'Carregando' : `${safeInt(filtered.length)} projetos na visão`}</span>
      </section>

      {error ? <section className={styles.errorBox}>{errorMessage(error, 'Não foi possível carregar Projetos V2.')}</section> : null}

      <section className={styles.gridCards} aria-label="Resumo de projetos">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Projetos</span><BriefcaseIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(projects.length)}</strong>
          <p className={styles.cardHelper}>{safeInt(totals.activeProjects)} ativos ou em andamento</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Tarefas</span><ChecklistIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(totals.totalTasks)}</strong>
          <p className={styles.cardHelper}>{safeInt(totals.doneTasks)} concluídas pelo payload atual</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Equipe vinculada</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(projects.reduce((acc, project) => acc + memberCount(project), 0))}</strong>
          <p className={styles.cardHelper}>Soma de membros retornados pela API</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Modo</span><ShieldIcon size={15} /></div>
          <strong className={styles.cardValue}>GET</strong>
          <p className={styles.cardHelper}>Sem POST, PATCH ou DELETE</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.tablePanel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Snapshot de projetos</p>
              <h2>Projetos carregados</h2>
              <p>Lista limitada para validação de estrutura, vínculo com cliente e progresso aparente.</p>
            </div>
            <span className={styles.statusBadgeMuted}>GET /api/projects</span>
          </header>
          <div className={styles.table} role="table" aria-label="Projetos V2">
            <div className={styles.tableHead} role="row"><span>Projeto</span><span>Cliente</span><span>Status</span><span>Tarefas</span><span>Atualização</span></div>
            {filtered.slice(0, 80).map((project, index) => {
              const key = projectId(project, index);
              const active = selectedProject ? projectId(selectedProject) === key : index === 0;
              return (
                <button
                  type="button"
                  className={`${styles.tableRow} ${styles.tableRowClickable} ${active ? styles.tableRowActive : ''}`.trim()}
                  role="row"
                  key={key}
                  onClick={() => setSelectedProjectKey(key)}
                >
                  <span><strong>{projectName(project)}</strong><br /><small>{memberCount(project)} membros</small></span>
                  <span>{clientName(project)}</span>
                  <span>{projectStatus(project)}</span>
                  <span>{safeInt(countDone(project))} / {safeInt(countTasks(project))}</span>
                  <span>{projectUpdatedAt(project)}</span>
                </button>
              );
            })}
          </div>
          {!loading && filtered.length === 0 ? <p className={styles.emptyState}>Nenhum projeto encontrado para os filtros atuais.</p> : null}
        </article>

        <article className={styles.panel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Detalhe readonly</p>
              <h2>{selectedProject ? projectName(selectedProject) : 'Projeto selecionado'}</h2>
              <p>Prévia operacional do projeto sem edição de quadro, membros ou tarefas.</p>
            </div>
            <span className={styles.statusBadgeMuted}>Sem escrita</span>
          </header>
          {selectedProject ? (
            <>
              <div className={styles.detailGrid}>
                <div className={styles.detailMetric}><span>Cliente</span><strong>{clientName(selectedProject)}</strong></div>
                <div className={styles.detailMetric}><span>Status</span><strong>{projectStatus(selectedProject)}</strong></div>
                <div className={styles.detailMetric}><span>Tarefas</span><strong>{safeInt(countDone(selectedProject))} / {safeInt(countTasks(selectedProject))}</strong></div>
                <div className={styles.detailMetric}><span>Membros</span><strong>{safeInt(memberCount(selectedProject))}</strong></div>
              </div>
              <div className={styles.miniList}>
                {selectedTasks.map((task, index) => (
                  <div className={styles.miniListRow} key={task?.id || task?.title || index}>
                    <strong>{task?.title || task?.name || `Tarefa ${index + 1}`}</strong>
                    <span>{task?.status || 'Sem status'}</span>
                  </div>
                ))}
                {!selectedTasks.length ? <p className={styles.emptyState}>O payload atual não trouxe tarefas detalhadas para este projeto.</p> : null}
              </div>
            </>
          ) : <p className={styles.emptyState}>Selecione um projeto para validar o detalhe.</p>}
        </article>
      </section>
    </main>
  );
}
