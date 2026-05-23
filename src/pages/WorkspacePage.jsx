import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getUserAvatar } from '../utils/avatarStorage.js';
import UserSpreadsheetPanel from '../components/spreadsheets/UserSpreadsheetPanel.jsx';
import { ArrowUpRightIcon, BuildingIcon, HomeIcon, PlusIcon, SettingsIcon } from '../components/ui/Icons.jsx';
import styles from './WorkspacePage.module.css';

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function WorkspacePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const avatarUrl = getUserAvatar(user);
  const displayName = user?.name || 'Meu espaço de trabalho';

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar} aria-label="Espaço de trabalho">
        <div className={styles.brand}>edifica</div>

        <nav className={styles.sideNav} aria-label="Navegação do espaço">
          <span className={styles.sideActive}><BuildingIcon size={16} /> Meu espaço de trabalho</span>
          <span>Planilhas</span>
          <span>Recursos</span>
          <span>Configurações</span>
        </nav>

        <div className={styles.sidebarFooter}>
          <Link to="/" className={styles.backButton}><HomeIcon size={15} /> Voltar para a central</Link>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <h1>Meu espaço de trabalho</h1>
            <p>{displayName}</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.headerButton}><SettingsIcon size={15} /> Configurações</button>
            <span className={styles.avatar} title={displayName}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(displayName)}</span>
          </div>
        </header>

        <section className={styles.settingsList} aria-label="Resumo do espaço">
          <button type="button" className={styles.settingRow}>
            <span><strong>Nome do espaço de trabalho</strong><em>{displayName}</em></span>
            <span>Meu espaço de trabalho <ArrowUpRightIcon size={15} /></span>
          </button>
          <button type="button" className={styles.settingRow}>
            <span><strong>Planilhas pessoais</strong><em>Crie e organize planilhas privadas do seu usuário</em></span>
            <span>Ativo <ArrowUpRightIcon size={15} /></span>
          </button>
          <button type="button" className={styles.settingRow}>
            <span><strong>Novo recurso</strong><em>Área preparada para futuras ferramentas pessoais</em></span>
            <span><PlusIcon size={15} /></span>
          </button>
        </section>

        <section className={styles.sheetSection}>
          <UserSpreadsheetPanel ownerUserId={user?.id} canEdit showToast={showToast} />
        </section>
      </section>
    </main>
  );
}
