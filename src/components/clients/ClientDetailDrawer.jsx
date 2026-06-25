import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clientInitials,
  statusClass,
  statusLabel,
} from '../../utils/clientHelpers.js';
import { updateClient } from '../../api/clients.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { hasPermission } from '../../utils/permissions.js';
import { isAdminUser } from '../../utils/roles.js';
import {
  getClientAvatar,
  readAvatarFile,
  removeClientAvatar,
  saveClientAvatar,
  subscribeAvatarChange,
} from '../../utils/avatarStorage.js';
import { CloseIcon, PaperclipIcon, ProjectBoardIcon } from '../ui/Icons.jsx';
import OverviewTab from './OverviewTab.jsx';
import AnalysisTab from './AnalysisTab.jsx';
import ClientProjectTab from './ClientProjectTab.jsx';
import ClientBookTab from './ClientBookTab.jsx';
import ClientTasksTab from './ClientTasksTab.jsx';
import ClientFilesTab from './ClientFilesTab.jsx';
import drawerStyles from './ClientDetailDrawer.module.css';
import tabStyles from './ClientTabs.module.css';

const TABS = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'book', label: 'Book do cliente' },
  { key: 'files', label: 'Drive', icon: PaperclipIcon },
];

const ANALYSIS_TABS = [
  { key: 'icp', label: 'Análise ICP' },
  { key: 'gdv', label: 'Análise GDV' },
  { key: 'routes', label: 'Resumo de Rotas' },
];

export default function ClientDetailDrawer({
  client,
  squads = [],
  users = [],
  canEditClient = false,
  canViewFeeSchedule = false,
  canEditFeeSchedule = false,
  canDelete = false,
  onClose,
  onUpdated,
  onDeleted,
  initialTab = 'overview',
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [avatarUrl, setAvatarUrl] = useState(() => getClientAvatar(client));
  const avatarInputRef = useRef(null);

  const { user } = useAuth();
  const { showToast } = useToast();
  const admin = canDelete || isAdminUser(user);
  const canManageAvatar = canEditClient;
  const canViewProject = hasPermission(user, 'projects.view');
  const canCreateProject = hasPermission(user, 'projects.create');

  useEffect(() => {
    setActiveTab(initialTab || 'overview');
    setAvatarUrl(getClientAvatar(client));
  }, [client?.id, initialTab]);

  useEffect(() => subscribeAvatarChange(() => setAvatarUrl(getClientAvatar(client))), [client]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const sc = statusClass(client);
  const sl = statusLabel(client);
  const statusTone =
    sc === 'cc-active'
      ? {
          color: 'var(--success)',
          background: 'var(--success-soft)',
          border: 'color-mix(in srgb, var(--success) 24%, transparent)',
        }
      : sc === 'cc-ending'
        ? {
            color: 'var(--warning)',
            background: 'var(--warning-soft)',
            border: 'color-mix(in srgb, var(--warning) 26%, transparent)',
          }
        : sc === 'cc-onboarding'
          ? {
              color: '#8ab4ff',
              background: 'rgba(90, 169, 255, 0.08)',
              border: 'rgba(90, 169, 255, 0.24)',
            }
          : sc === 'cc-rampage'
            ? {
                color: 'var(--warning)',
                background: 'var(--warning-soft)',
                border: 'color-mix(in srgb, var(--warning) 26%, transparent)',
              }
          : sc === 'cc-paused' || sc === 'cc-finished'
            ? {
                color: 'var(--text-secondary)',
                background: 'rgba(255, 255, 255, 0.04)',
                border: 'rgba(255, 255, 255, 0.11)',
              }
            : {
                color: 'var(--danger)',
                background: 'var(--danger-soft)',
                border: 'color-mix(in srgb, var(--danger) 24%, transparent)',
              };

  const handleAvatarFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !client?.id) return;

      try {
        const dataUrl = await readAvatarFile(file);
        const response = await updateClient(client.id, { avatarUrl: dataUrl });
        saveClientAvatar(client, dataUrl);
        setAvatarUrl(dataUrl);
        showToast('Foto do cliente atualizada.', { variant: 'success' });
        onUpdated?.(response?.client || { ...client, avatarUrl: dataUrl });
      } catch (error) {
        showToast(error?.message || 'Não foi possível usar esta imagem.', {
          variant: 'error',
        });
      }
    },
    [client, onUpdated, showToast]
  );

  const handleRemoveAvatar = useCallback(async () => {
    if (!client?.id) return;
    try {
      const response = await updateClient(client.id, { avatarUrl: '' });
      removeClientAvatar(client);
      setAvatarUrl('');
      showToast('Foto do cliente removida.', { variant: 'success' });
      onUpdated?.(response?.client || { ...client, avatarUrl: '' });
    } catch (error) {
      showToast(error?.message || 'Não foi possível remover a foto.', {
        variant: 'error',
      });
    }
  }, [client, onUpdated, showToast]);

  const visibleTabs = useMemo(() => TABS, []);

  useEffect(() => {
    if (activeTab === 'project' && !canViewProject) {
      setActiveTab('overview');
    }
  }, [activeTab, canViewProject]);

  if (!client) return null;

  const node = (
    <div className={drawerStyles.overlay} role="presentation" onClick={onClose}>
      <section
        className={drawerStyles.modalCard}
        data-active-tab={activeTab}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-drawer-name"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={drawerStyles.modalHead}>
          <div className={drawerStyles.identity}>
            <div
              className={drawerStyles.avatar}
              aria-label={`Avatar de ${client.name}`}
              title={client.name}
            >
              {avatarUrl ? <img src={avatarUrl} alt="" /> : clientInitials(client.name)}
            </div>

            <div className={drawerStyles.identityText}>
              <div className={drawerStyles.nameRow}>
                <h2 id="client-drawer-name" className={drawerStyles.name}>
                  {client.name}
                </h2>
                <span
                  className={drawerStyles.status}
                  style={{
                    color: statusTone.color,
                    background: statusTone.background,
                    border: `1px solid ${statusTone.border}`,
                  }}
                >
                  {sl}
                </span>
              </div>
            </div>
          </div>

          <div className={drawerStyles.modalHeadActions}>
            <button
              type="button"
              className={`${drawerStyles.headerIconAction} ${activeTab === 'tasks' ? drawerStyles.headerActionActive : ''}`.trim()}
              onClick={() => setActiveTab('tasks')}
              aria-label="Tasks do cliente"
              title="Tasks"
            >
              <ProjectBoardIcon size={15} />
            </button>
            {canViewProject ? (
              <button
                type="button"
                className={`${drawerStyles.headerAction} ${activeTab === 'project' ? drawerStyles.headerActionActive : ''}`.trim()}
                onClick={() => setActiveTab('project')}
              >
                Projeto
              </button>
            ) : null}
            <button
              type="button"
              className={drawerStyles.iconBtn}
              onClick={onClose}
              aria-label="Fechar detalhes"
            >
              <CloseIcon size={16} />
            </button>
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarFile}
            hidden
          />
        </header>

        <div className={drawerStyles.modalBody}>
          <aside className={tabStyles.tabsBar} role="tablist" aria-label="Detalhes do cliente">
            <div className={tabStyles.primaryTabs}>
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    className={`${tabStyles.tab} ${tabStyles[`tab_${tab.key}`] || ''} ${
                      activeTab === tab.key ? tabStyles.tabActive : ''
                    }`.trim()}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {Icon ? <Icon size={14} /> : null}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className={tabStyles.analysisTabs}>
              {ANALYSIS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`${tabStyles.analysisTab} ${tabStyles[`analysisTab_${tab.key}`] || ''} ${
                    activeTab === tab.key ? tabStyles.analysisTabActive : ''
                  }`.trim()}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </aside>

          <main className={tabStyles.tabBody}>
            {activeTab === 'overview' && (
              <OverviewTab
                client={client}
                squads={squads}
                users={users}
                canEdit={canEditClient}
                canDelete={admin}
                avatarUrl={avatarUrl}
                canManageAvatar={canManageAvatar}
                onPickAvatar={() => avatarInputRef.current?.click()}
                onRemoveAvatar={handleRemoveAvatar}
                canViewFeeSchedule={canViewFeeSchedule}
                canEditFeeSchedule={canEditFeeSchedule}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
              />
            )}

            {activeTab === 'project' && canViewProject ? (
              <ClientProjectTab
                client={client}
                users={users}
                canCreateProject={canCreateProject}
              />
            ) : null}

            {activeTab === 'book' && (
              <ClientBookTab client={client} />
            )}

            {activeTab === 'tasks' && (
              <ClientTasksTab client={client} />
            )}

            {activeTab === 'files' && (
              <ClientFilesTab client={client} canEdit={canEditClient} />
            )}

            {activeTab === 'icp' && (
              <AnalysisTab clientId={client.id} type="icp" canEdit={canEditClient} />
            )}

            {activeTab === 'gdv' && (
              <AnalysisTab clientId={client.id} type="gdvanalise" canEdit={canEditClient} />
            )}

            {activeTab === 'routes' && (
              <AnalysisTab clientId={client.id} type="route_summary" canEdit={canEditClient} />
            )}
          </main>
        </div>
</section>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
