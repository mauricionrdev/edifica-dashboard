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
import { CloseIcon } from '../ui/Icons.jsx';
import OverviewTab from './OverviewTab.jsx';
import AnalysisTab from './AnalysisTab.jsx';
import FeeScheduleTab from './FeeScheduleTab.jsx';
import ClientProjectTab from './ClientProjectTab.jsx';
import drawerStyles from './ClientDetailDrawer.module.css';
import tabStyles from './ClientTabs.module.css';

const TABS = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'project', label: 'Projeto' },
  { key: 'fees', label: 'Mensalidades' },
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
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [avatarUrl, setAvatarUrl] = useState(() => getClientAvatar(client));
  const avatarInputRef = useRef(null);

  const { user } = useAuth();
  const { showToast } = useToast();
  const admin = canDelete || isAdminUser(user);
  const canManageAvatar = canEditClient;
  const canViewProject = hasPermission(user, 'projects.view');
  const canCreateProject = hasPermission(user, 'projects.create');

  useEffect(() => {
    setActiveTab('overview');
    setAvatarUrl(getClientAvatar(client));
  }, [client?.id]);

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

  if (!client) return null;

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
          : sc === 'cc-paused'
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

  const visibleTabs = useMemo(
    () =>
      TABS.filter((tab) => {
        if (tab.key === 'fees') return canViewFeeSchedule;
        if (tab.key === 'project') return canViewProject;
        return true;
      }),
    [canViewFeeSchedule, canViewProject]
  );

  useEffect(() => {
    if (activeTab === 'fees' && !canViewFeeSchedule) {
      setActiveTab('overview');
      return;
    }

    if (activeTab === 'project' && !canViewProject) {
      setActiveTab('overview');
    }
  }, [activeTab, canViewFeeSchedule, canViewProject]);

  const node = (
    <div className={drawerStyles.overlay} role="presentation" onClick={onClose}>
      <section
        className={drawerStyles.modalCard}
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
              <span className={drawerStyles.modalEyebrow}>Cliente</span>
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
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`${tabStyles.tab} ${
                  activeTab === tab.key ? tabStyles.tabActive : ''
                }`.trim()}
                onClick={() => setActiveTab(tab.key)}
              >
                <span>{tab.label}</span>
              </button>
            ))}
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


            {activeTab === 'fees' && canViewFeeSchedule ? (
              <FeeScheduleTab
                client={client}
                canEdit={canEditFeeSchedule}
                onUpdated={onUpdated}
              />
            ) : null}

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
