// ================================================================
//  ClientDetailDrawer
//  Drawer lateral com 5 abas estilo Asana:
//    Visão geral · Onboarding · Contrato · ICP · GDV
//
//  O drawer mantém o header fixo (status + avatar + nome + fechar) e
//  abaixo renderiza a TabBar + conteúdo da aba ativa. Status de
//  auto-save do onboarding aparece na TabBar à direita.
// ================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clientInitials,
  colorFromName,
  statusClass,
  statusLabel,
} from '../../utils/clientHelpers.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdminUser } from '../../utils/roles.js';
import { CloseIcon } from '../ui/Icons.jsx';
import OverviewTab from './OverviewTab.jsx';
import OnboardingTab from './OnboardingTab.jsx';
import ContractTab from './ContractTab.jsx';
import AnalysisTab from './AnalysisTab.jsx';
import drawerStyles from './ClientDetailDrawer.module.css';
import tabStyles from './ClientTabs.module.css';

const TABS = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'contract', label: 'Contrato' },
  { key: 'icp', label: 'Análise ICP' },
  { key: 'gdv', label: 'Análise GDV' },
];

function SaveStatusPill({ status }) {
  if (!status || status === 'idle') return null;
  const labels = {
    pending: 'Alterações pendentes',
    saving: 'Salvando…',
    saved: 'Salvo',
    error: 'Erro ao salvar',
  };
  const cls = tabStyles[status] || '';
  return (
    <div className={`${tabStyles.saveStatus} ${cls}`.trim()}>
      <span className={tabStyles.saveDot} />
      <span>{labels[status]}</span>
    </div>
  );
}

export default function ClientDetailDrawer({
  client,
  squads = [],
  canDelete = false,
  onClose,
  onUpdated,
  onDeleted,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [obStatus, setObStatus] = useState('idle'); // status do onboarding

  const { user } = useAuth();
  // canDelete vem do pai, mas reforçamos aqui para caso de mudança
  const admin = canDelete || isAdminUser(user);

  // Reset tab ao trocar de cliente
  useEffect(() => {
    setActiveTab('overview');
    setObStatus('idle');
  }, [client?.id]);

  // ESC fecha
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const avatarBg = useMemo(
    () => colorFromName(client?.name),
    [client?.name]
  );

  if (!client) return null;

  const sc = statusClass(client);
  const sl = statusLabel(client);
  const statusTone =
    sc === 'cc-active'
      ? {
          color: '#7fc99b',
          background: 'rgba(34,197,94,.12)',
          border: 'rgba(34,197,94,.22)',
        }
      : sc === 'cc-ending'
      ? {
          color: '#fbbf24',
          background: 'rgba(245,195,0,.12)',
          border: 'rgba(245,195,0,.22)',
        }
      : {
          color: '#ef8f8f',
          background: 'rgba(239,68,68,.12)',
          border: 'rgba(239,68,68,.22)',
        };

  const handleStatusChange = useCallback((s) => setObStatus(s), []);

  const node = (
    <>
      <div
        className={drawerStyles.overlay}
        role="presentation"
        onClick={onClose}
      />
      <aside
        className={drawerStyles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-drawer-name"
      >
        {/* Header fixo */}
        <div className={drawerStyles.header}>
          <div className={drawerStyles.topbar}>
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
            <div className={drawerStyles.topbarActions}>
              <button
                type="button"
                className={drawerStyles.iconBtn}
                onClick={onClose}
                aria-label="Fechar detalhes"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </div>

          <div className={drawerStyles.identity}>
            <div
              className={drawerStyles.avatar}
              style={{ background: avatarBg }}
              aria-hidden="true"
            >
              {clientInitials(client.name)}
            </div>
            <div className={drawerStyles.identityText}>
              <h2 id="client-drawer-name" className={drawerStyles.name}>
                {client.name}
              </h2>
            </div>
          </div>
        </div>

        {/* Barra de abas */}
        <div className={tabStyles.tabsBar} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              className={`${tabStyles.tab} ${
                activeTab === t.key ? tabStyles.tabActive : ''
              }`.trim()}
              onClick={() => setActiveTab(t.key)}
            >
              <span>{t.label}</span>
            </button>
          ))}
          {activeTab === 'onboarding' && (
            <SaveStatusPill status={obStatus} />
          )}
        </div>

        {/* Conteúdo da aba */}
        <div className={tabStyles.tabBody}>
          {activeTab === 'overview' && (
            <OverviewTab
              client={client}
              squads={squads}
              canDelete={admin}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          )}

          {activeTab === 'onboarding' && (
            <OnboardingTab
              clientId={client.id}
              onStatusChange={handleStatusChange}
            />
          )}

          {activeTab === 'contract' && (
            <ContractTab
              client={client}
              squads={squads}
              onUpdated={onUpdated}
            />
          )}

          {activeTab === 'icp' && (
            <AnalysisTab clientId={client.id} type="icp" />
          )}

          {activeTab === 'gdv' && (
            <AnalysisTab clientId={client.id} type="gdvanalise" />
          )}
        </div>
      </aside>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
