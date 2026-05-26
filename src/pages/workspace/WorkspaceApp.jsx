import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { createWorkspaceDocument, deleteWorkspaceDocument, listSupportTasks, listWorkspaceDocuments, updateWorkspaceDocument } from '../../api/support.js';
import { getUserAvatar } from '../../utils/avatarStorage.js';
import WorkspaceShell from './WorkspaceShell.jsx';
import WorkspaceSheets from './WorkspaceSheets.jsx';
import styles from './WorkspaceApp.module.css';
import { WORKSPACE_AREAS, WORKSPACE_AREA_IDS } from './workspaceNavigation.js';
import { formatDate, isDone, isOverdue, isToday, normalizeText, taskLabel, taskPriorityScore } from './workspaceUtils.js';


function WorkspaceConfirm({ state, onCancel, onConfirm }) {
  if (!state) return null;
  return (
    <div className={styles.modalBackdrop} role="presentation">
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-label={state.title}>
        <span>Confirmar exclusão</span>
        <h2>{state.title}</h2>
        <p>{state.description}</p>
        <div className={styles.modalActions}>
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button type="button" size="sm" variant="danger" onClick={onConfirm}>Excluir</Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function TaskRow({ task }) {
  return (
    <article className={styles.taskRow}>
      <div>
        <strong>{task.title || 'Tarefa sem título'}</strong>
        <span>{task.clientName || task.projectName || task.typeLabel || 'Demanda interna'}</span>
      </div>
      <div className={styles.taskMeta}>
        <span>{taskLabel(task)}</span>
        <span>{formatDate(task.dueDate)}</span>
      </div>
    </article>
  );
}

function HomeView({ tasks, documents, onNavigate }) {
  const openTasks = tasks.filter((task) => !isDone(task));
  const focusTasks = [...openTasks].sort((a, b) => taskPriorityScore(b) - taskPriorityScore(a)).slice(0, 5);
  const overdue = openTasks.filter(isOverdue).length;
  const today = openTasks.filter(isToday).length;
  const noDue = openTasks.filter((task) => !task.dueDate).length;
  return (
    <div className={styles.viewGrid}>
      <section className={styles.heroPanel}>
        <div>
          <span className={styles.eyebrow}>Meu espaço de trabalho</span>
          <h1>Central pessoal de execução</h1>
          <p>Organize tarefas, documentos e planilhas internas em uma base única e persistente.</p>
        </div>
        <div className={styles.quickActions}>
          <Button type="button" size="sm" onClick={() => onNavigate('sheets')}>Abrir planilhas</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('documents')}>Criar documento</Button>
        </div>
      </section>

      <section className={styles.kpiGrid}>
        <button type="button" onClick={() => onNavigate('tasks')} className={styles.kpiCard}>
          <span>Abertas</span><strong>{openTasks.length}</strong>
        </button>
        <button type="button" onClick={() => onNavigate('inbox')} className={styles.kpiCard}>
          <span>Atrasadas</span><strong>{overdue}</strong>
        </button>
        <button type="button" onClick={() => onNavigate('tasks')} className={styles.kpiCard}>
          <span>Hoje</span><strong>{today}</strong>
        </button>
        <button type="button" onClick={() => onNavigate('inbox')} className={styles.kpiCard}>
          <span>Sem prazo</span><strong>{noDue}</strong>
        </button>
      </section>

      <section className={styles.panelWide}>
        <div className={styles.panelHeader}>
          <div><span className={styles.eyebrow}>Fila sugerida</span><h2>Próximas ações</h2></div>
          <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('tasks')}>Ver tarefas</Button>
        </div>
        {focusTasks.length ? focusTasks.map((task) => <TaskRow key={task.id} task={task} />) : <EmptyState title="Sem tarefas urgentes" description="Nada crítico ou atrasado neste momento." />}
      </section>

      <section className={styles.panelWide}>
        <div className={styles.panelHeader}>
          <div><span className={styles.eyebrow}>Recentes</span><h2>Documentos</h2></div>
          <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('documents')}>Abrir documentos</Button>
        </div>
        {documents.slice(0, 4).map((doc) => (
          <article className={styles.documentLine} key={doc.id}>
            <strong>{doc.title || 'Documento sem título'}</strong>
            <span>{doc.updatedAt ? `Atualizado em ${formatDate(doc.updatedAt)}` : 'Sem atualização'}</span>
          </article>
        ))}
        {!documents.length && <EmptyState title="Nenhum documento" description="Crie páginas operacionais para registrar decisões, processos e anotações." />}
      </section>
    </div>
  );
}

function InboxView({ tasks, documents, onNavigate }) {
  const items = [
    ...tasks.filter((task) => !isDone(task) && (isOverdue(task) || !task.dueDate)).map((task) => ({ type: 'task', id: task.id, title: task.title, meta: taskLabel(task), action: 'tasks' })),
    ...documents.filter((doc) => !String(doc.content || '').trim()).slice(0, 8).map((doc) => ({ type: 'doc', id: doc.id, title: doc.title || 'Documento sem conteúdo', meta: 'Documento vazio', action: 'documents' })),
  ];
  return (
    <section className={styles.panelFull}>
      <div className={styles.panelHeader}>
        <div><span className={styles.eyebrow}>Triagem</span><h1>Caixa de entrada</h1></div>
      </div>
      {items.map((item) => (
        <button type="button" key={`${item.type}-${item.id}`} className={styles.inboxItem} onClick={() => onNavigate(item.action)}>
          <div><strong>{item.title || 'Item sem título'}</strong><span>{item.meta}</span></div>
          <span>Resolver</span>
        </button>
      ))}
      {!items.length && <EmptyState title="Caixa de entrada limpa" description="Não há itens sem triagem agora." />}
    </section>
  );
}

function TasksView({ tasks }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('open');
  const visible = useMemo(() => {
    const term = normalizeText(query);
    return tasks.filter((task) => {
      if (filter === 'open' && isDone(task)) return false;
      if (filter === 'overdue' && !isOverdue(task)) return false;
      if (filter === 'today' && !isToday(task)) return false;
      if (term && !normalizeText(`${task.title} ${task.clientName} ${task.projectName}`).includes(term)) return false;
      return true;
    }).sort((a, b) => taskPriorityScore(b) - taskPriorityScore(a));
  }, [tasks, query, filter]);
  return (
    <section className={styles.panelFull}>
      <div className={styles.panelHeader}>
        <div><span className={styles.eyebrow}>Execução</span><h1>Tarefas</h1></div>
        <input className={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tarefa" />
      </div>
      <div className={styles.segmented}>
        {[['open', 'Abertas'], ['overdue', 'Atrasadas'], ['today', 'Hoje'], ['all', 'Todas']].map(([id, label]) => (
          <button key={id} type="button" data-active={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {visible.map((task) => <TaskRow key={task.id} task={task} />)}
      {!visible.length && <EmptyState title="Nenhuma tarefa encontrada" description="Ajuste o filtro ou a busca para visualizar outros itens." />}
    </section>
  );
}

function DocumentsView({ documents, onCreate, onDelete, onSave }) {
  const [activeId, setActiveId] = useState('');
  const active = documents.find((doc) => doc.id === activeId) || documents[0] || null;
  const [draft, setDraft] = useState({ title: '', content: '' });

  useEffect(() => {
    setDraft({ title: active?.title || '', content: active?.content || '' });
  }, [active?.id]);

  async function save() {
    if (!active) return;
    await onSave(active.id, draft);
  }

  return (
    <section className={styles.documentsLayout}>
      <aside className={styles.documentsRail}>
        <div className={styles.panelHeaderCompact}>
          <strong>Documentos</strong>
          <Button type="button" size="sm" onClick={onCreate}>Novo</Button>
        </div>
        {documents.map((doc) => (
          <button key={doc.id} type="button" data-active={active?.id === doc.id} onClick={() => setActiveId(doc.id)}>
            <strong>{doc.title || 'Sem título'}</strong>
            <span>{doc.updatedAt ? formatDate(doc.updatedAt) : 'Sem atualização'}</span>
          </button>
        ))}
      </aside>
      <main className={styles.documentEditor}>
        {active ? (
          <>
            <div className={styles.editorActions}>
              <Button type="button" size="sm" onClick={save}>Salvar</Button>
              <Button type="button" size="sm" variant="danger" onClick={() => onDelete(active.id)}>Excluir</Button>
            </div>
            <input className={styles.documentTitle} value={draft.title} onChange={(event) => setDraft((state) => ({ ...state, title: event.target.value }))} placeholder="Sem título" />
            <textarea className={styles.documentBody} value={draft.content} onChange={(event) => setDraft((state) => ({ ...state, content: event.target.value }))} placeholder="Escreva o conteúdo operacional aqui." />
          </>
        ) : <EmptyState title="Nenhum documento" description="Crie o primeiro documento do workspace." />}
      </main>
    </section>
  );
}

function SettingsView() {
  return (
    <section className={styles.panelFull}>
      <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Workspace</span><h1>Configurações</h1></div></div>
      <div className={styles.settingsList}>
        <div><strong>Persistência</strong><span>Dados do workspace usam API e banco. Nada aqui depende de localStorage operacional.</span></div>
        <div><strong>Planilhas</strong><span>Referência principal: Google Planilhas. A aba Bases será criada separadamente quando houver modelagem própria.</span></div>
        <div><strong>Design system</strong><span>Novos componentes devem usar tokens da plataforma e evitar cores soltas.</span></div>
      </div>
    </section>
  );
}

export default function WorkspaceApp() {
  const { user } = useAuth();
  const pageRef = useRef(null);
  const resizeRef = useRef(null);
  const [active, setActive] = useState('home');
  const [sidebarWidth, setSidebarWidth] = useState(244);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDeleteDocument, setPendingDeleteDocument] = useState(null);

  const displayName = user?.name || user?.email || 'Meu espaço';
  const avatar = getUserAvatar(user);
  const initials = useMemo(() => String(displayName || 'ED').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ED', [displayName]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskRes, docRes] = await Promise.allSettled([listSupportTasks(), listWorkspaceDocuments()]);
      if (taskRes.status === 'fulfilled') setTasks(Array.isArray(taskRes.value?.tasks) ? taskRes.value.tasks : []);
      if (docRes.status === 'fulfilled') setDocuments(Array.isArray(docRes.value?.documents) ? docRes.value.documents : []);
      if (taskRes.status === 'rejected' && docRes.status === 'rejected') throw taskRes.reason;
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar o workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function handlePointerMove(event) {
      if (!resizeRef.current) return;
      const nextWidth = Math.min(328, Math.max(204, event.clientX - resizeRef.current.left));
      setSidebarWidth(nextWidth);
    }

    function handlePointerUp() {
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const navigateWorkspace = useCallback((nextArea) => {
    if (!WORKSPACE_AREA_IDS.includes(nextArea)) return;
    setActive(nextArea);
  }, []);

  function handleStartResize(mode) {
    if (mode === 'toggle') {
      setSidebarCollapsed((current) => !current);
      return;
    }
    const left = pageRef.current?.getBoundingClientRect?.().left || 0;
    resizeRef.current = { left };
    setSidebarCollapsed(false);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  async function handleCreateDocument() {
    const response = await createWorkspaceDocument({ title: 'Novo documento', content: '' });
    if (response?.document) {
      setDocuments((current) => [response.document, ...current]);
      setActive('documents');
    }
  }

  async function handleSaveDocument(id, patch) {
    const response = await updateWorkspaceDocument(id, patch);
    if (response?.document) setDocuments((current) => current.map((doc) => (doc.id === id ? response.document : doc)));
  }

  function handleDeleteDocument(id) {
    const doc = documents.find((item) => item.id === id);
    setPendingDeleteDocument({ id, title: 'Excluir documento?', description: `O documento ${doc?.title || 'sem título'} será removido de forma permanente.` });
  }

  async function confirmDeleteDocument() {
    if (!pendingDeleteDocument?.id) return;
    await deleteWorkspaceDocument(pendingDeleteDocument.id);
    setDocuments((current) => current.filter((doc) => doc.id !== pendingDeleteDocument.id));
    setPendingDeleteDocument(null);
  }

  const openTasks = tasks.filter((task) => !isDone(task));
  const tabCounters = useMemo(() => ({
    inbox: openTasks.filter((task) => isOverdue(task) || !task.dueDate).length,
    tasks: openTasks.length,
    documents: documents.length,
  }), [documents.length, openTasks]);
  const activeArea = WORKSPACE_AREAS.find((area) => area.id === active) || WORKSPACE_AREAS[0];
  const primaryActionLabel = active === 'documents' ? 'Novo documento' : active === 'sheets' ? 'Abrir planilhas' : 'Nova planilha';
  const primaryAction = active === 'documents' ? handleCreateDocument : () => setActive('sheets');

  return (
    <WorkspaceShell
      pageRef={pageRef}
      sidebarCollapsed={sidebarCollapsed}
      sidebarWidth={sidebarWidth}
      minSidebarWidth={72}
      activeTab={active}
      activeTabLabel={activeArea.label}
      tabCounters={tabCounters}
      displayName={displayName}
      avatar={avatar}
      initials={initials}
      tasksLoading={loading}
      onTabChange={navigateWorkspace}
      onRefresh={load}
      onOpenSettings={() => setActive('settings')}
      onPrimaryAction={primaryAction}
      primaryActionLabel={primaryActionLabel}
      onStartResize={handleStartResize}
    >
      {error && <div className={styles.errorBox}>{error}</div>}
      {loading ? <div className={styles.loadingBox}>Carregando workspace...</div> : (
        <>
          {active === 'home' && <HomeView tasks={tasks} documents={documents} onNavigate={navigateWorkspace} />}
          {active === 'inbox' && <InboxView tasks={tasks} documents={documents} onNavigate={navigateWorkspace} />}
          {active === 'tasks' && <TasksView tasks={tasks} />}
          {active === 'documents' && <DocumentsView documents={documents} onCreate={handleCreateDocument} onDelete={handleDeleteDocument} onSave={handleSaveDocument} />}
          {active === 'sheets' && <WorkspaceSheets />}
          {active === 'settings' && <SettingsView />}
        </>
      )}
      <WorkspaceConfirm state={pendingDeleteDocument} onCancel={() => setPendingDeleteDocument(null)} onConfirm={confirmDeleteDocument} />
    </WorkspaceShell>
  );
}
