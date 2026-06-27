import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { createWorkspaceDocument, deleteWorkspaceDocument, listSupportTasks, listWorkspaceDocuments, updateWorkspaceDocument } from '../../api/support.js';
import { listClients } from '../../api/clients.js';
import { getUserAvatar } from '../../utils/avatarStorage.js';
import WorkspaceConfirmDialog from './WorkspaceConfirmDialog.jsx';
import WorkspaceDocuments from './WorkspaceDocuments.jsx';
import WorkspaceHome from './WorkspaceHome.jsx';
import WorkspaceInbox from './WorkspaceInbox.jsx';
import WorkspaceSettings from './WorkspaceSettings.jsx';
import WorkspaceSheets from './WorkspaceSheets.jsx';
import WorkspaceShell from './WorkspaceShell.jsx';
import WorkspaceTasks from './WorkspaceTasks.jsx';
import { WORKSPACE_AREAS, WORKSPACE_AREA_IDS } from './workspaceNavigation.js';
import { computeCentralMetrics } from '../../utils/centralMetrics.js';
import { fmtMoney } from '../../utils/format.js';
import { isDone, isOverdue } from './workspaceUtils.js';

const MIN_SIDEBAR_WIDTH = 72;
const DEFAULT_SIDEBAR_WIDTH = 248;

export default function WorkspaceApp() {
  const { user } = useAuth();
  const pageRef = useRef(null);
  const resizeRef = useRef(null);
  const [activeAreaId, setActiveAreaId] = useState('home');
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [supportClients, setSupportClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmState, setConfirmState] = useState(null);

  const displayName = user?.name || user?.email || 'Usuário';
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'ED';
  const avatar = getUserAvatar(user);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskResult, documentResult, clientResult] = await Promise.allSettled([
        listSupportTasks(),
        listWorkspaceDocuments(),
        listClients(),
      ]);

      if (taskResult.status === 'fulfilled') {
        setTasks(Array.isArray(taskResult.value?.tasks) ? taskResult.value.tasks : []);
      }
      if (documentResult.status === 'fulfilled') {
        setDocuments(Array.isArray(documentResult.value?.documents) ? documentResult.value.documents : []);
      }
      if (clientResult.status === 'fulfilled') {
        setSupportClients(Array.isArray(clientResult.value?.clients) ? clientResult.value.clients : []);
      }
      if (taskResult.status === 'rejected' && documentResult.status === 'rejected') {
        throw taskResult.reason;
      }
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar o workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    function handlePointerMove(event) {
      if (!resizeRef.current) return;
      const nextWidth = Math.min(328, Math.max(204, event.clientX - resizeRef.current.left));
      setSidebarWidth(nextWidth);
    }

    function handlePointerUp() {
      if (!resizeRef.current) return;
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

  const navigateWorkspace = useCallback((nextAreaId) => {
    if (!WORKSPACE_AREA_IDS.includes(nextAreaId)) return;
    setActiveAreaId(nextAreaId);
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
      setActiveAreaId('documents');
    }
  }

  async function handleSaveDocument(documentId, patch) {
    const response = await updateWorkspaceDocument(documentId, patch);
    if (response?.document) {
      setDocuments((current) => current.map((document) => (document.id === documentId ? response.document : document)));
    }
  }

  function requestDeleteDocument(documentId) {
    const document = documents.find((item) => item.id === documentId);
    setConfirmState({
      title: 'Excluir documento?',
      description: `O documento ${document?.title || 'sem título'} será removido de forma permanente.`,
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        await deleteWorkspaceDocument(documentId);
        setDocuments((current) => current.filter((item) => item.id !== documentId));
        setConfirmState(null);
      },
    });
  }

  const openTasks = useMemo(() => tasks.filter((task) => !isDone(task)), [tasks]);
  const tabCounters = useMemo(() => ({
    inbox: openTasks.filter((task) => isOverdue(task) || !task.dueDate).length,
    tasks: openTasks.length,
    documents: documents.length,
  }), [documents.length, openTasks]);

  const supportMetrics = useMemo(() => {
    const now = new Date();
    const metrics = computeCentralMetrics(supportClients, now.getFullYear(), now.getMonth());
    const active = Number(metrics.active) || 0;
    const mrr = Number(metrics.mrr) || 0;
    const ticket = active > 0 ? mrr / active : 0;
    return [
      { label: 'Clientes ativos', value: String(active) },
      { label: 'MRR atual', value: fmtMoney(mrr) },
      { label: 'Receita nova', value: fmtMoney(metrics.revenueNew || 0) },
      { label: 'Ticket médio', value: fmtMoney(ticket) },
    ];
  }, [supportClients]);

  const activeArea = WORKSPACE_AREAS.find((area) => area.id === activeAreaId) || WORKSPACE_AREAS[0];
  const primaryActionLabel = activeAreaId === 'documents' ? 'Novo documento' : activeAreaId === 'sheets' ? 'Nova planilha' : 'Abrir planilhas';
  const primaryAction = activeAreaId === 'documents' ? handleCreateDocument : () => setActiveAreaId('sheets');

  return (
    <WorkspaceShell
      pageRef={pageRef}
      activeArea={activeArea}
      activeAreaId={activeAreaId}
      avatar={avatar}
      displayName={displayName}
      initials={initials}
      loading={loading}
      minSidebarWidth={MIN_SIDEBAR_WIDTH}
      primaryActionLabel={primaryActionLabel}
      sidebarCollapsed={sidebarCollapsed}
      sidebarWidth={sidebarWidth}
      tabCounters={tabCounters}
      onOpenSettings={() => setActiveAreaId('settings')}
      onPrimaryAction={primaryAction}
      onRefresh={loadWorkspace}
      onStartResize={handleStartResize}
      onTabChange={navigateWorkspace}
    >
      {error ? <div role="alert" className="workspace-state-box">{error}</div> : null}
      {loading ? <div className="workspace-state-box">Carregando workspace...</div> : null}
      {!loading && activeAreaId === 'home' ? <WorkspaceHome tasks={tasks} documents={documents} supportMetrics={supportMetrics} onNavigate={navigateWorkspace} /> : null}
      {!loading && activeAreaId === 'inbox' ? <WorkspaceInbox tasks={tasks} documents={documents} onNavigate={navigateWorkspace} /> : null}
      {!loading && activeAreaId === 'tasks' ? <WorkspaceTasks tasks={tasks} /> : null}
      {!loading && activeAreaId === 'documents' ? (
        <WorkspaceDocuments
          documents={documents}
          onCreate={handleCreateDocument}
          onDelete={requestDeleteDocument}
          onSave={handleSaveDocument}
        />
      ) : null}
      {!loading && activeAreaId === 'sheets' ? <WorkspaceSheets requestConfirm={setConfirmState} /> : null}
      {!loading && activeAreaId === 'settings' ? <WorkspaceSettings /> : null}
      <WorkspaceConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} />
    </WorkspaceShell>
  );
}
