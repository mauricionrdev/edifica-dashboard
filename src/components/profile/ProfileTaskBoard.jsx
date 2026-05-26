import styles from './ProfileTaskBoard.module.css';

function safeText(value, fallback = '—') {
  const text = String(value || '').trim();
  return text || fallback;
}

function initials(name) {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

function avatarTone(value) {
  const tone = String(value || 'amber').toLowerCase();
  return ['amber', 'blue', 'violet', 'emerald', 'rose', 'slate'].includes(tone) ? tone : 'amber';
}

function peopleLabel(people = []) {
  const names = people.map((person) => person.userName || person.name || 'Usuário');
  if (!names.length) return 'Sem colaboradores';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} e mais ${names.length - 3}`;
}

function LoadingRows() {
  return (
    <div className={styles.loading} aria-label="Carregando tarefas">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className={styles.loadingRow}>
          <span />
          <div>
            <i />
            <b />
          </div>
          <em />
          <em />
          <strong />
        </div>
      ))}
    </div>
  );
}

export default function ProfileTaskBoard({
  tabs = [],
  activeTab = 'all',
  counts = {},
  onTabChange,
  loading = false,
  error = '',
  tasks = [],
  emptyLabel = 'Sem tarefas',
  onOpenTask,
  onToggleTask,
  canToggleTask,
  updatingTaskId = '',
  getTaskDone,
  getTaskTitle,
  getTaskSubtitle,
  getTaskTags,
  getTaskStage,
  getTaskPeople,
  getTaskDue,
  pagination = null,
}) {
  return (
    <div className={styles.board}>
      {tabs.length ? (
        <nav className={styles.tabs} aria-label="Tarefas">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`${styles.tab} ${activeTab === tab.value ? styles.tabActive : ''}`.trim()}
              onClick={() => onTabChange?.(tab.value)}
              aria-current={activeTab === tab.value ? 'page' : undefined}
            >
              <span>{tab.label}</span>
              <strong>{counts[tab.value] || 0}</strong>
            </button>
          ))}
        </nav>
      ) : null}

      <div className={styles.table}>
        <div className={styles.head} aria-hidden="true">
          <span />
          <span>Tarefa</span>
          <span>Propriedades</span>
          <span>Etapa</span>
          <span>Colab.</span>
          <span>Prazo</span>
        </div>

        {loading ? <LoadingRows /> : null}
        {!loading && error ? <div className={styles.empty}>Erro</div> : null}
        {!loading && !error && !tasks.length ? <div className={styles.empty}>{emptyLabel}</div> : null}

        {!loading && !error && tasks.length ? (
          <div className={styles.list}>
            {tasks.map((task) => {
              const done = Boolean(getTaskDone?.(task));
              const title = getTaskTitle?.(task) || 'Tarefa sem título';
              const subtitle = getTaskSubtitle?.(task) || '';
              const tags = Array.isArray(getTaskTags?.(task)) ? getTaskTags(task).filter(Boolean).slice(0, 2) : [];
              const stage = getTaskStage?.(task) || { label: 'Aberta', progress: 0, tone: 'yellow' };
              const people = Array.isArray(getTaskPeople?.(task)) ? getTaskPeople(task) : [];
              const due = getTaskDue?.(task) || { label: 'Sem prazo', tone: '' };
              const canToggle = onToggleTask && (typeof canToggleTask === 'function' ? canToggleTask(task) : true);

              return (
                <article
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  className={`${styles.row} ${done ? styles.rowDone : ''}`.trim()}
                  onClick={() => onOpenTask?.(task)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenTask?.(task);
                    }
                  }}
                >
                  {canToggle ? (
                    <button
                      type="button"
                      className={`${styles.statusCheck} ${done ? styles.statusCheckDone : ''}`.trim()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleTask?.(task);
                      }}
                      disabled={updatingTaskId === task.id}
                      aria-label={done ? 'Reabrir' : 'Concluir'}
                    >
                      {done ? '✓' : ''}
                    </button>
                  ) : (
                    <span className={`${styles.statusCheck} ${done ? styles.statusCheckDone : ''}`.trim()} aria-hidden="true">
                      {done ? '✓' : ''}
                    </span>
                  )}

                  <div className={styles.main}>
                    <strong>{safeText(title, 'Tarefa sem título')}</strong>
                    {subtitle ? <span>{subtitle}</span> : null}
                  </div>

                  <div className={styles.properties}>
                    {tags.length ? tags.map((tag) => (
                      <span key={tag.key || tag.label} className={`${styles.tag} ${styles[`tag_${tag.tone || 'default'}`] || ''}`.trim()}>
                        {tag.label}
                      </span>
                    )) : <span className={styles.dash}>—</span>}
                  </div>

                  <div className={styles.stageCell}>
                    <span
                      className={`${styles.stagePill} ${styles[`stage_${stage.tone || 'yellow'}`] || ''}`.trim()}
                      
                    >
                      <span className={styles.stageTrack} style={{ width: `${stage.progress || 0}%` }} aria-hidden="true" />
                      <span className={styles.stageLabel}>{stage.label}</span>
                      <span className={styles.stageValue}>{stage.progress || 0}%</span>
                    </span>
                  </div>

                  <div className={styles.peopleCell}>
                    {people.length ? (
                      <span className={styles.avatarStack} aria-label={`Colaboradores: ${peopleLabel(people)}`} title={peopleLabel(people)}>
                        {people.slice(0, 4).map((person) => {
                          const avatar = person.avatarUrl || person.avatar || '';
                          const name = person.userName || person.name || 'Usuário';
                          return (
                            <span
                              key={person.userId || person.id || name}
                              className={`${styles.avatar} ${avatar ? styles.avatarPhoto : styles[`avatar_${avatarTone(person.avatarColor)}`] || ''}`.trim()}
                              title={name}
                            >
                              {avatar ? <img src={avatar} alt="" /> : initials(name)}
                            </span>
                          );
                        })}
                        {people.length > 4 ? <span className={`${styles.avatar} ${styles.avatarMore}`}>+{people.length - 4}</span> : null}
                      </span>
                    ) : <span className={styles.dash}>—</span>}
                  </div>

                  <div className={styles.dueCell}>
                    <span className={`${styles.due} ${styles[`due_${due.tone || ''}`] || ''}`.trim()}>{due.label}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      {pagination ? <div className={styles.pagination}>{pagination}</div> : null}
    </div>
  );
}
