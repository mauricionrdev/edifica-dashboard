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

const CODE_LINES = [
  [
    { text: 'import ', type: 'keyword' },
    { text: '{ ', type: 'plain' },
    { text: 'monitorarInfraestrutura', type: 'function' },
    { text: ', ', type: 'plain' },
    { text: 'iniciarPainel', type: 'function' },
    { text: ' } ', type: 'plain' },
    { text: 'from ', type: 'keyword' },
    { text: '"./suporte"', type: 'string' },
    { text: ';', type: 'plain' },
  ],
  [
    { text: 'const ', type: 'keyword' },
    { text: 'titulo', type: 'identifier' },
    { text: ' = ', type: 'plain' },
    { text: '"Suporte de tecnologia"', type: 'string' },
    { text: ';', type: 'plain' },
  ],
  [
    { text: 'const ', type: 'keyword' },
    { text: 'estadoInicial', type: 'identifier' },
    { text: ' = ', type: 'plain' },
    { text: '{ ', type: 'plain' },
    { text: 'status', type: 'property' },
    { text: ': ', type: 'plain' },
    { text: '"em_construcao"', type: 'string' },
    { text: ', ', type: 'plain' },
    { text: 'renderizando', type: 'property' },
    { text: ': ', type: 'plain' },
    { text: 'true', type: 'value' },
    { text: ' };', type: 'plain' },
  ],
  [
    { text: 'const ', type: 'keyword' },
    { text: 'janela', type: 'identifier' },
    { text: ' = ', type: 'plain' },
    { text: 'criarJanela', type: 'function' },
    { text: '(', type: 'plain' },
    { text: '"painel-tecnologia"', type: 'string' },
    { text: ');', type: 'plain' },
  ],
  [
    { text: 'janela', type: 'identifier' },
    { text: '.', type: 'plain' },
    { text: 'aplicarTema', type: 'function' },
    { text: '(', type: 'plain' },
    { text: '"dark"', type: 'string' },
    { text: ', ', type: 'plain' },
    { text: '"alto_contraste"', type: 'string' },
    { text: ');', type: 'plain' },
  ],
  [
    { text: 'monitorarInfraestrutura', type: 'function' },
    { text: '({ ', type: 'plain' },
    { text: 'whatsapp', type: 'property' },
    { text: ': ', type: 'plain' },
    { text: 'true', type: 'value' },
    { text: ', ', type: 'plain' },
    { text: 'apiOpenAI', type: 'property' },
    { text: ': ', type: 'plain' },
    { text: 'true', type: 'value' },
    { text: ', ', type: 'plain' },
    { text: 'alertas', type: 'property' },
    { text: ': ', type: 'plain' },
    { text: '"ativos"', type: 'string' },
    { text: ' });', type: 'plain' },
  ],
  [
    { text: 'const ', type: 'keyword' },
    { text: 'etapas', type: 'identifier' },
    { text: ' = [', type: 'plain' },
    { text: '"layout"', type: 'string' },
    { text: ', ', type: 'plain' },
    { text: '"integrações"', type: 'string' },
    { text: ', ', type: 'plain' },
    { text: '"animações"', type: 'string' },
    { text: '];', type: 'plain' },
  ],
  [
    { text: 'etapas', type: 'identifier' },
    { text: '.', type: 'plain' },
    { text: 'forEach', type: 'function' },
    { text: '(', type: 'plain' },
    { text: '(etapa) => ', type: 'plain' },
    { text: 'registrarMarco', type: 'function' },
    { text: '(etapa));', type: 'plain' },
  ],
  [
    { text: 'iniciarPainel', type: 'function' },
    { text: '({ ', type: 'plain' },
    { text: 'titulo', type: 'property' },
    { text: ', ', type: 'plain' },
    { text: 'estado', type: 'property' },
    { text: ': ', type: 'plain' },
    { text: 'estadoInicial', type: 'identifier' },
    { text: ' });', type: 'plain' },
  ],
  [
    { text: 'renderizarAviso', type: 'function' },
    { text: '(', type: 'plain' },
    { text: '"Em construção"', type: 'string' },
    { text: ', ', type: 'plain' },
    { text: '"Aguardando próxima versão"', type: 'string' },
    { text: ');', type: 'plain' },
  ],
];

const BUILD_STEPS = [
  'Montando estrutura da tela',
  'Criando componentes do workspace',
  'Conectando alertas e monitoramento',
  'Compilando interface de suporte',
  'Preparando próxima entrega',
];

function cleanText(value) {
  return String(value ?? '').trim();
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

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Button type="button" size="sm" onClick={() => setDemandModalOpen(true)}>
          <PlusIcon size={14} /> Nova demanda
        </Button>
      </div>

      <section className={styles.workspace} aria-label="Painel em construção">
        <div className={styles.grid} aria-hidden="true" />
        <div className={styles.scanline} aria-hidden="true" />
        <div className={styles.codeRainLeft} aria-hidden="true" />
        <div className={styles.codeRainRight} aria-hidden="true" />
        <div className={styles.ambientGlow} aria-hidden="true" />

        <div className={styles.editorShell}>
          <header className={styles.editorTopbar}>
            <div className={styles.windowDots} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span className={styles.editorLabel}>src/pages/SupportTechnologyPage.jsx</span>
            <span className={styles.editorStatus}>compilando</span>
          </header>

          <div className={styles.editorBody}>
            <ol className={styles.codeBlock}>
              {CODE_LINES.map((line, index) => (
                <li
                  key={`line-${index + 1}`}
                  className={styles.codeLine}
                  style={{
                    '--delay': `${index * 0.82}s`,
                    '--steps': Math.max(16, line.reduce((sum, token) => sum + token.text.length, 0)),
                  }}
                >
                  <span className={styles.lineNumber}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={styles.lineInner}>
                    {line.map((token, tokenIndex) => (
                      <span key={`token-${index + 1}-${tokenIndex}`} className={styles[`token_${token.type}`] || styles.token_plain}>
                        {token.text}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>

            <aside className={styles.statusDock}>
              <span className={styles.statusEyebrow}>Montagem da interface</span>
              <ul className={styles.statusList}>
                {BUILD_STEPS.map((step, index) => (
                  <li key={step} style={{ '--delay': `${0.6 + index * 0.9}s` }}>
                    <span className={styles.statusDot} aria-hidden="true" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
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
