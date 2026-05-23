import { useMemo, useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import DemandModal from '../components/tasks/DemandModal.jsx';
import { PlusIcon } from '../components/ui/Icons.jsx';
import { createTaskAttachment } from '../api/projects.js';
import { createSupportTask } from '../api/support.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import styles from './SupportTechnologyPage.module.css';

const MASTER_SUPPORT_EMAIL = 'mauricionredifica@gmail.com';
const MASTER_SUPPORT_NAME = 'mauricio nunes';
const SUPPORT_ROLES = new Set(['suporte_tecnologia']);
const FALLBACK_SUPPORT_ROLES = new Set(['ceo', 'admin']);

const EDITOR_LINES = [
  [
    ['const', 'keyword'], [' telaSuporte ', 'identifier'], ['= ', 'plain'], ['criarTela', 'function'], ['({', 'plain'],
  ],
  [
    ['  nome', 'property'], [': ', 'plain'], ['\'Suporte de tecnologia\'', 'string'], [',', 'plain'],
  ],
  [
    ['  tema', 'property'], [': ', 'plain'], ['\'escuro operacional\'', 'string'], [',', 'plain'],
  ],
  [
    ['  estado', 'property'], [': ', 'plain'], ['\'em construção\'', 'string'], [',', 'plain'],
  ],
  [
    ['  monitoramento', 'property'], [': ', 'plain'], ['true', 'value'], [',', 'plain'],
  ],
  [
    ['});', 'plain'],
  ],
  [
    ['carregarModulo', 'function'], ['(', 'plain'], ['\'demandas\'', 'string'], [');', 'plain'],
  ],
  [
    ['validarPermissoes', 'function'], ['({ ', 'plain'], ['perfil', 'property'], [': ', 'plain'], ['\'suporte\'', 'string'], [' });', 'plain'],
  ],
  [
    ['sincronizarFila', 'function'], ['(', 'plain'], ['clientesAtivos', 'identifier'], [');', 'plain'],
  ],
  [
    ['renderizarInterface', 'function'], ['(', 'plain'], ['telaSuporte', 'identifier'], [');', 'plain'],
  ],
  [
    ['publicarVersao', 'function'], ['(', 'plain'], ['\'proxima entrega\'', 'string'], [');', 'plain'],
  ],
];

const TERMINAL_LINES = [
  'preparando workspace da tecnologia',
  'montando estrutura da tela',
  'criando área de demandas',
  'validando permissões internas',
  'organizando próximos módulos',
  'compilando suporte de tecnologia',
  'aguardando próxima versão',
];

const BACKDROP_LINES = [
  'const tarefa = criarDemanda(usuario, prioridade);',
  'await sincronizarClientes({ origem: "central" });',
  'if (alerta.critico) notificarSuporte();',
  'painel.atualizar({ status: "em_construcao" });',
  'monitorarFila(demandas, responsaveis);',
  'registrarEvento("suporte_tecnologia");',
  'validarAcesso(usuario, recurso);',
  'renderizarModulo("tecnologia");',
];

function cleanText(value) {
  return String(value ?? '').trim();
}

function renderTokens(line, lineIndex) {
  return line.map(([text, type], tokenIndex) => (
    <span key={`${lineIndex}-${tokenIndex}`} className={styles[`token_${type}`] || styles.token_plain}>
      {text}
    </span>
  ));
}

export default function SupportTechnologyPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { clients = [], userDirectory = [], setPanelHeader } = useOutletContext();
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    setPanelHeader?.({ title: 'Suporte de tecnologia', description: null, actions: null });
  }, [setPanelHeader]);

  const activeUsers = useMemo(() => (
    Array.isArray(userDirectory) ? userDirectory.filter((item) => item?.id && item?.active !== false) : []
  ), [userDirectory]);

  const supportMaster = useMemo(() => {
    const directoryMatch = activeUsers.find((item) => (
      String(item.email || '').toLowerCase() === MASTER_SUPPORT_EMAIL
      || String(item.name || '').trim().toLowerCase() === MASTER_SUPPORT_NAME
    ));
    if (directoryMatch) return directoryMatch;
    const currentUserIsMaster = (
      String(user?.email || '').toLowerCase() === MASTER_SUPPORT_EMAIL
      || String(user?.name || '').trim().toLowerCase() === MASTER_SUPPORT_NAME
    );
    return currentUserIsMaster ? user : null;
  }, [activeUsers, user]);

  const supportUsers = useMemo(() => {
    if (supportMaster?.id) return [supportMaster];
    const direct = activeUsers.filter((item) => SUPPORT_ROLES.has(item.role));
    if (direct.length) return direct;
    const fallback = activeUsers.filter((item) => FALLBACK_SUPPORT_ROLES.has(item.role));
    return fallback.length ? fallback : activeUsers;
  }, [activeUsers, supportMaster]);

  const defaultAssigneeId = supportMaster?.id || supportUsers[0]?.id || user?.id || '';

  const handleCreateTask = async (form) => {
    const title = cleanText(form.title);
    if (!title) {
      showToast('Informe o título da demanda.', { variant: 'warning' });
      return;
    }
    setCreatingTask(true);
    try {
      const data = await createSupportTask({
        title,
        type: form.type,
        priority: form.priority,
        clientId: form.clientId,
        assigneeUserId: form.assigneeUserId || defaultAssigneeId,
        collaboratorUserIds: form.collaboratorUserIds,
        dueDate: form.dueDate,
        description: form.description,
      });
      const taskId = data?.task?.id;
      if (taskId && form.attachments?.length) {
        await Promise.allSettled(form.attachments.map((item) => createTaskAttachment(taskId, {
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          dataUrl: item.dataUrl,
        })));
      }
      setDemandModalOpen(false);
      showToast('Demanda criada.');
    } catch (err) {
      showToast(err?.message || 'Não foi possível criar a demanda.', { variant: 'error' });
    } finally {
      setCreatingTask(false);
    }
  };

  const backgroundRows = [...BACKDROP_LINES, ...BACKDROP_LINES, ...BACKDROP_LINES];
  const terminalRows = [...TERMINAL_LINES, ...TERMINAL_LINES];

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Button type="button" size="sm" onClick={() => setDemandModalOpen(true)}>
          <PlusIcon size={14} /> Nova demanda
        </Button>
      </div>

      <section className={styles.workspace} aria-label="Suporte de tecnologia em construção">
        <div className={styles.backdrop} aria-hidden="true">
          <div className={styles.backdropTrack}>
            {backgroundRows.map((line, index) => (
              <span key={`${line}-${index}`}>{line}</span>
            ))}
          </div>
        </div>
        <div className={styles.noise} aria-hidden="true" />
        <div className={styles.sweep} aria-hidden="true" />

        <div className={styles.editorShell}>
          <header className={styles.editorHeader}>
            <div className={styles.windowDots} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span className={styles.fileName}>src/pages/SupportTechnologyPage.jsx</span>
            <span className={styles.compileStatus}>em execução</span>
          </header>

          <div className={styles.editorBody}>
            <div className={styles.codePane}>
              {EDITOR_LINES.map((line, index) => (
                <div
                  key={`editor-line-${index + 1}`}
                  className={styles.codeLine}
                  style={{
                    '--delay': `${index * 0.38}s`,
                    '--duration': `${5.4 + (index % 4) * 0.4}s`,
                  }}
                >
                  <span className={styles.lineNumber}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={styles.liveText}>{renderTokens(line, index)}</span>
                </div>
              ))}
              <div className={styles.activePrompt}>
                <span>npm run construir:suporte</span>
                <i aria-hidden="true" />
              </div>
            </div>

            <aside className={styles.terminalPanel} aria-label="Progresso da construção">
              <span className={styles.terminalTitle}>processo interno</span>
              <div className={styles.terminalViewport}>
                <div className={styles.terminalTrack}>
                  {terminalRows.map((line, index) => (
                    <span key={`${line}-${index}`}>› {line}</span>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          <footer className={styles.editorFooter}>
            <span>Suporte de tecnologia</span>
            <strong>Em construção</strong>
          </footer>
        </div>
      </section>

      {demandModalOpen ? (
        <DemandModal
          open={demandModalOpen}
          clients={clients}
          users={activeUsers}
          assigneeUsers={supportUsers}
          defaultAssigneeUserId={defaultAssigneeId}
          creating={creatingTask}
          onClose={() => setDemandModalOpen(false)}
          onSubmit={handleCreateTask}
        />
      ) : null}
    </div>
  );
}
