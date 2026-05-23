import { useMemo, useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import Avatar from '../components/ui/Avatar.jsx';
import Button from '../components/ui/Button.jsx';
import DemandModal from '../components/tasks/DemandModal.jsx';
import { BotIcon, PlusIcon } from '../components/ui/Icons.jsx';
import { createTaskAttachment } from '../api/projects.js';
import { createSupportTask } from '../api/support.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import { roleLabel } from '../utils/roles.js';
import styles from './SupportTechnologyPage.module.css';

const MASTER_SUPPORT_EMAIL = 'mauricionredifica@gmail.com';
const MASTER_SUPPORT_NAME = 'mauricio nunes';
const SUPPORT_ROLES = new Set(['suporte_tecnologia']);
const FALLBACK_SUPPORT_ROLES = new Set(['ceo', 'admin']);

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
      <section className={styles.profileHero}>
        <div className={styles.heroIdentity}>
          <Avatar
            src={getUserAvatar(supportMaster) || supportMaster?.avatarUrl || undefined}
            name={supportMaster?.name || 'Mauricio Nunes'}
            size="lg"
            className={styles.avatar}
            fallbackColor={supportMaster?.avatarColor}
          />
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Tecnologia</span>
            <div className={styles.nameRow}>
              <h1>Suporte de tecnologia</h1>
              <span className={styles.roleBadge}>{roleLabel(supportMaster?.role || 'suporte_tecnologia')}</span>
              <span className={styles.ownerBadge}>Responsável: {supportMaster?.name || 'Mauricio Nunes'}</span>
            </div>
          </div>
          <div className={styles.heroActions}>
            <Button type="button" size="sm" onClick={() => setDemandModalOpen(true)}>
              <PlusIcon size={14} /> Nova demanda
            </Button>
            <span className={styles.heroIcon} aria-hidden="true"><BotIcon size={18} /></span>
          </div>
        </div>
      </section>

      <section className={styles.supportConstruction}>
        <strong>Em construção</strong>
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
