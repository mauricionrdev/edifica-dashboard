import { useEffect, useMemo, useState } from 'react';
import { listClientProjectTasks } from '../../api/projects.js';
import Avatar from '../ui/Avatar.jsx';
import styles from './ClientTaskTabs.module.css';

const TYPE_LABELS = {
  briefing: 'Briefing',
  routine: 'Rotina',
  support: 'Suporte',
  bug: 'Bug',
  access: 'Acesso',
  adjustment: 'Ajuste',
  other: 'Outro',
};

const STATUS_LABELS = {
  todo: 'Aberta',
  in_progress: 'Implementação',
  activation_gdv: 'Ativação/Acessos GDV',
  access_delivery: 'Ativação/Acessos GDV',
  traffic_activation: 'Ativação/Acessos GDV',
  final_validation: 'Validação',
  done: 'Concluída',
  canceled: 'Cancelada',
};

function getTaskKind(task) {
  const match = String(task?.description || '').match(/^Tipo:\s*([^\n]+)/i);
  const raw = match?.[1] || '';
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('briefing')) return 'briefing';
  if (normalized.includes('rotina')) return 'routine';
  if (normalized.includes('suporte')) return 'support';
  if (normalized.includes('bug')) return 'bug';
  if (normalized.includes('acesso')) return 'access';
  if (normalized.includes('ajuste')) return 'adjustment';
  return 'other';
}

function taskProgress(task) {
  if (task?.status === 'done') return 100;
  if (task?.status === 'canceled') return 0;
  if (getTaskKind(task) === 'briefing') {
    const map = { todo: 25, in_progress: 25, activation_gdv: 50, access_delivery: 50, traffic_activation: 50, final_validation: 75 };
    return map[task?.status] || 25;
  }
  const map = { todo: 0, in_progress: 50, final_validation: 75 };
  return map[task?.status] ?? 0;
}

function formatDate(value) {
  if (!value) return 'Sem prazo';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return 'Sem prazo';
  return `${day}/${month}/${year}`;
}

export default function ClientTasksTab({ client }) {
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [collaboratorsByTask, setCollaboratorsByTask] = useState({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!client?.id) return;
      try {
        setLoading(true);
        const res = await listClientProjectTasks(client.id);
        if (!mounted) return;
        setTasks(res?.tasks || []);
        setCollaboratorsByTask(res?.collaboratorsByTask || {});
      } catch {
        if (mounted) {
          setTasks([]);
          setCollaboratorsByTask({});
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [client?.id]);

  const rows = useMemo(() => tasks.map((task) => {
    const kind = getTaskKind(task);
    return {
      ...task,
      kind,
      kindLabel: TYPE_LABELS[kind] || 'Tarefa',
      statusLabel: STATUS_LABELS[task.status] || 'Aberta',
      progress: taskProgress(task),
      collaborators: collaboratorsByTask[task.id] || [],
    };
  }), [tasks, collaboratorsByTask]);

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h3>Tarefas</h3>
          <span>Tarefas vinculadas a este cliente.</span>
        </div>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tarefa</th>
              <th>Propriedades</th>
              <th>Etapa</th>
              <th>Colab.</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((task) => (
              <tr key={task.id}>
                <td>
                  <div className={styles.taskTitle}>
                    <strong>{task.title}</strong>
                    <span>{task.assigneeName || task.createdByName || 'Sem responsável'}</span>
                  </div>
                </td>
                <td><span className={`${styles.badge} ${task.kind === 'briefing' ? styles.badgeBriefing : ''}`}>{task.kindLabel}</span></td>
                <td><span className={`${styles.statusPill} ${task.status === 'done' ? styles.statusDone : task.status === 'todo' ? '' : styles.statusActive}`}><span>{task.statusLabel}</span><b>{task.progress}%</b></span></td>
                <td>
                  <div className={styles.avatarStack}>
                    {(task.collaborators.length ? task.collaborators : [{ id: task.assigneeUserId, name: task.assigneeName }]).filter((item) => item?.id || item?.name).slice(0, 4).map((person) => (
                      <Avatar key={person.id || person.name} src={person.avatarUrl || undefined} name={person.name} size="xs" />
                    ))}
                  </div>
                </td>
                <td className={styles.dateCell}>{formatDate(task.dueDate)}</td>
              </tr>
            ))}
            {!loading && !rows.length ? (
              <tr><td colSpan="5" className={styles.empty}>Nenhuma tarefa vinculada a este cliente.</td></tr>
            ) : null}
            {loading ? (
              <tr><td colSpan="5" className={styles.empty}>Carregando tarefas...</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
