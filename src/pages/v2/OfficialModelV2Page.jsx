import { useEffect, useMemo, useState } from 'react';
import { BookTemplateIcon, ChecklistIcon, SearchIcon, ShieldIcon } from '../../components/ui/Icons.jsx';
import { getTemplate } from '../../api/template.js';
import { ApiError } from '../../api/client.js';
import styles from './OfficialModelV2Page.module.css';

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeTemplate(raw) {
  if (!Array.isArray(raw)) return [];

  return raw.map((section, sectionIndex) => ({
    id: `${sectionIndex}-${String(section?.sec || 'secao')}`,
    title: String(section?.sec || 'Seção sem nome').trim() || 'Seção sem nome',
    tasks: Array.isArray(section?.tasks)
      ? section.tasks.map((task, taskIndex) => ({
          id: `${sectionIndex}-${taskIndex}-${String(task?.name || 'tarefa')}`,
          name: String(task?.name || 'Tarefa sem nome').trim() || 'Tarefa sem nome',
          assignee: String(task?.assignee || '').trim(),
          notes: String(task?.notes || '').trim(),
          subs: Array.isArray(task?.subs)
            ? task.subs.map((sub, subIndex) => ({
                id: `${sectionIndex}-${taskIndex}-${subIndex}`,
                name: String(sub?.name || 'Subtarefa sem nome').trim() || 'Subtarefa sem nome',
              }))
            : [],
        }))
      : [],
  }));
}

function countSubtasks(sections) {
  return sections.reduce(
    (total, section) => total + section.tasks.reduce((taskTotal, task) => taskTotal + task.subs.length, 0),
    0
  );
}

function formatDate(value) {
  if (!value) return 'Sem atualização registrada';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sem atualização registrada';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export default function OfficialModelV2Page() {
  const [sections, setSections] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError(null);

    getTemplate()
      .then((res) => {
        if (!alive) return;
        setSections(normalizeTemplate(res?.template?.sections));
        setUpdatedAt(res?.template?.updatedAt || null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o modelo oficial.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const summary = useMemo(() => {
    const taskCount = sections.reduce((total, section) => total + section.tasks.length, 0);
    return {
      sections: sections.length,
      tasks: taskCount,
      subtasks: countSubtasks(sections),
    };
  }, [sections]);

  const filteredSections = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return sections;

    return sections
      .map((section) => {
        const sectionMatches = normalizeText(section.title).includes(normalizedQuery);
        const tasks = section.tasks.filter((task) => {
          const haystack = normalizeText([
            task.name,
            task.assignee,
            task.notes,
            ...task.subs.map((sub) => sub.name),
          ].join(' '));
          return sectionMatches || haystack.includes(normalizedQuery);
        });

        if (!sectionMatches && tasks.length === 0) return null;
        return { ...section, tasks: sectionMatches ? section.tasks : tasks };
      })
      .filter(Boolean);
  }, [query, sections]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true">
          <BookTemplateIcon size={20} />
        </div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Modelo Oficial V2 · rota paralela</p>
          <h1>Leitura segura do modelo de projeto</h1>
          <p>
            Rota interna, somente leitura e fora da sidebar. Ela consulta o endpoint atual do Modelo Oficial, sem salvar, resetar ou alterar estrutura de projeto em produção.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem escrita no banco</span>
      </section>

      <section className={styles.metrics} aria-label="Resumo do modelo oficial">
        <article className={styles.metricCard}>
          <span>Seções</span>
          <strong>{loading ? '—' : summary.sections}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Tarefas</span>
          <strong>{loading ? '—' : summary.tasks}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Subtarefas</span>
          <strong>{loading ? '—' : summary.subtasks}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Última atualização</span>
          <strong className={styles.dateValue}>{formatDate(updatedAt)}</strong>
        </article>
      </section>

      <section className={styles.toolbar} aria-label="Busca no modelo oficial">
        <label className={styles.searchBox}>
          <SearchIcon size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar seção, tarefa, responsável ou observação"
          />
        </label>
        <span className={styles.readOnly}><ChecklistIcon size={14} /> Validação sem edição</span>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Estrutura carregada</h2>
            <p>
              {loading
                ? 'Carregando modelo oficial...'
                : `${filteredSections.length} seção${filteredSections.length === 1 ? '' : 'ões'} nesta visão`}
            </p>
          </div>
        </div>

        {error ? <div className={styles.stateBox}>{error}</div> : null}
        {!error && !loading && filteredSections.length === 0 ? <div className={styles.stateBox}>Nenhum item encontrado.</div> : null}

        {!error && filteredSections.length > 0 ? (
          <div className={styles.sectionList}>
            {filteredSections.map((section, index) => (
              <article className={styles.sectionCard} key={section.id}>
                <header className={styles.sectionHeader}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.tasks.length} tarefa{section.tasks.length === 1 ? '' : 's'}</p>
                  </div>
                </header>

                {section.tasks.length > 0 ? (
                  <ol className={styles.taskList}>
                    {section.tasks.map((task) => (
                      <li className={styles.taskItem} key={task.id}>
                        <div className={styles.taskMain}>
                          <strong>{task.name}</strong>
                          <span>{task.assignee || 'Sem responsável fixo'}</span>
                        </div>
                        {task.notes ? <p className={styles.notes}>{task.notes}</p> : null}
                        {task.subs.length > 0 ? (
                          <ul className={styles.subList}>
                            {task.subs.map((sub) => <li key={sub.id}>{sub.name}</li>)}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.emptySection}>Seção sem tarefas cadastradas.</p>
                )}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
