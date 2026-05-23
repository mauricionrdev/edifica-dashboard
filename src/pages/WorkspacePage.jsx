import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import UserSpreadsheetPanel from '../components/spreadsheets/UserSpreadsheetPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import {
  ArrowUpRightIcon,
  BuildingIcon,
  CalendarIcon,
  ChecklistIcon,
  HomeIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from '../components/ui/Icons.jsx';
import styles from './WorkspacePage.module.css';

const TABS = [
  { id: 'home', label: 'Início' },
  { id: 'tasks', label: 'Tarefas' },
  { id: 'sheets', label: 'Planilhas' },
  { id: 'resources', label: 'Recursos' },
  { id: 'settings', label: 'Configurações' },
];

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function EmptyPanel({ title, eyebrow = 'Em construção' }) {
  return (
    <section className={styles.emptyPanel} aria-label={title}>
      <span>{eyebrow}</span>
      <strong>{title}</strong>
    </section>
  );
}

export default function WorkspacePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('home');
  const avatarUrl = getUserAvatar(user);
  const displayName = user?.name || 'Meu espaço de trabalho';

  const activeTabLabel = useMemo(() => TABS.find((tab) => tab.id === activeTab)?.label || 'Início', [activeTab]);

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar} aria-label="Meu espaço de trabalho">
        <div className={styles.sidebarHeader}>
          <span className={styles.brandMark}>edi</span>
          <div>
            <strong>Workspace</strong>
            <span>pessoal</span>
          </div>
        </div>

        <nav className={styles.sideNav} aria-label="Navegação do espaço">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? styles.sideActive : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link to="/" className={styles.backButton}><HomeIcon size={15} /> Voltar para a central</Link>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span className={styles.avatar} title={displayName}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(displayName)}</span>
            <div>
              <span className={styles.eyebrow}>Meu espaço de trabalho</span>
              <h1>{displayName}</h1>
            </div>
          </div>

          <div className={styles.headerActions}>
            <Button size="sm" variant="secondary" onClick={() => setActiveTab('settings')}><SettingsIcon size={15} /> Configurações</Button>
            <Button size="sm" variant="primary" onClick={() => setActiveTab('sheets')}><PlusIcon size={15} /> Nova planilha</Button>
          </div>
        </header>

        <div className={styles.topStrip}>
          <div className={styles.workspaceTitle}>
            <span>{activeTabLabel}</span>
            <strong>{activeTab === 'home' ? 'Central pessoal' : activeTabLabel}</strong>
          </div>
          <nav className={styles.tabRail} aria-label="Áreas do workspace">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? styles.tabActive : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'home' ? (
          <section className={styles.homeGrid}>
            <button type="button" className={styles.featureCard} onClick={() => setActiveTab('tasks')}>
              <span className={styles.featureIcon}><ChecklistIcon size={18} /></span>
              <strong>Tarefas</strong>
              <em>Minhas tarefas</em>
              <ArrowUpRightIcon size={15} />
            </button>
            <button type="button" className={styles.featureCard} onClick={() => setActiveTab('sheets')}>
              <span className={styles.featureIcon}><BuildingIcon size={18} /></span>
              <strong>Planilhas</strong>
              <em>Planilhas pessoais</em>
              <ArrowUpRightIcon size={15} />
            </button>
            <button type="button" className={styles.featureCard} onClick={() => setActiveTab('resources')}>
              <span className={styles.featureIcon}><SparklesIcon size={18} /></span>
              <strong>Recursos</strong>
              <em>Área pessoal</em>
              <ArrowUpRightIcon size={15} />
            </button>
            <button type="button" className={styles.featureCard} onClick={() => setActiveTab('settings')}>
              <span className={styles.featureIcon}><CalendarIcon size={18} /></span>
              <strong>Configurações</strong>
              <em>Preferências</em>
              <ArrowUpRightIcon size={15} />
            </button>
          </section>
        ) : null}

        {activeTab === 'tasks' ? <EmptyPanel title="Tarefas pessoais" /> : null}

        {activeTab === 'sheets' ? (
          <section className={styles.sheetSection} aria-label="Planilhas pessoais">
            <UserSpreadsheetPanel ownerUserId={user?.id} canEdit showToast={showToast} />
          </section>
        ) : null}

        {activeTab === 'resources' ? <EmptyPanel title="Recursos pessoais" /> : null}
        {activeTab === 'settings' ? <EmptyPanel title="Configurações do espaço" /> : null}
      </section>
    </main>
  );
}
