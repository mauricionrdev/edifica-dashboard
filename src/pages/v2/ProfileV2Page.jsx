import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ShieldIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import { roleLabel } from '../../utils/roles.js';
import { getUserPermissions, getUserSquadIds } from '../../utils/permissions.js';
import { normalizeText, resolveName, safeInt } from './v2PageUtils.js';
import styles from './V2Operations.module.css';
import V2RouteNav from './V2RouteNav.jsx';

function userInitials(user) {
  const source = String(user?.name || user?.email || 'U').trim();
  return source.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'U';
}

function findSquadNames(user, squads = []) {
  const ids = getUserSquadIds(user).map(String);
  if (!ids.length) return [];
  return squads.filter((squad) => ids.includes(String(squad.id))).map((squad) => squad.name).filter(Boolean);
}

function scopedClients(user, clients = []) {
  const squadIds = getUserSquadIds(user).map(String);
  const userId = String(user?.id || '');
  if (!squadIds.length && !userId) return [];
  return clients.filter((client) => {
    const squadMatch = squadIds.includes(String(client?.squadId || client?.squad_id || ''));
    const gdvMatch = String(client?.gdvId || client?.gdv_id || '') === userId;
    const ownerMatch = String(client?.responsibleUserId || client?.responsible_user_id || client?.ownerUserId || '') === userId;
    return squadMatch || gdvMatch || ownerMatch;
  });
}

export default function ProfileV2Page() {
  const { user } = useAuth();
  const { clients = [], squads = [], userDirectory = [] } = useOutletContext();

  const permissions = useMemo(() => getUserPermissions(user), [user]);
  const squadNames = useMemo(() => findSquadNames(user, squads), [user, squads]);
  const clientsInScope = useMemo(() => scopedClients(user, clients), [user, clients]);
  const directoryMatch = useMemo(() => {
    const userId = String(user?.id || '');
    const userEmail = normalizeText(user?.email || '');
    return (userDirectory || []).find((item) => String(item?.id || '') === userId || normalizeText(item?.email || '') === userEmail) || null;
  }, [user, userDirectory]);

  return (
    <main className={styles.page}>
      <V2RouteNav currentKey="profile" />
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true">{userInitials(user)}</div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Perfil V2 · rota paralela</p>
          <h1>{resolveName(user?.name, 'Usuário')}</h1>
          <p>Leitura segura do perfil autenticado, escopo e permissões. Esta rota não edita avatar, capa, cargo ou dados de acesso.</p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Somente leitura</span>
      </section>

      <section className={styles.gridCards} aria-label="Resumo do perfil">
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Cargo</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{roleLabel(user?.role) || user?.role || '—'}</strong>
          <p className={styles.cardHelper}>{user?.email || 'Sem e-mail'}</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Permissões</span><ShieldIcon size={15} /></div>
          <strong className={styles.cardValue}>{permissions.includes('*') ? '*' : safeInt(permissions.length)}</strong>
          <p className={styles.cardHelper}>{permissions.includes('*') ? 'Acesso administrativo amplo' : 'Permissões diretas no perfil'}</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Squads</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(squadNames.length)}</strong>
          <p className={styles.cardHelper}>{squadNames.slice(0, 2).join(', ') || 'Sem vínculo direto'}</p>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.cardTop}><span>Clientes no escopo</span><UsersIcon size={15} /></div>
          <strong className={styles.cardValue}>{safeInt(clientsInScope.length)}</strong>
          <p className={styles.cardHelper}>Estimativa com dados já carregados no shell</p>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.tablePanel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Identidade</p>
              <h2>Dados carregados</h2>
              <p>Comparação entre sessão atual e diretório de usuários, sem edição.</p>
            </div>
          </header>
          <div className={styles.stackList}>
            <div className={styles.safeNotice}><ShieldIcon size={16} /><p>ID: {user?.id || 'Não informado'}</p></div>
            <div className={styles.safeNotice}><ShieldIcon size={16} /><p>Status: {user?.active === false ? 'Inativo' : 'Ativo'}</p></div>
            <div className={styles.safeNotice}><ShieldIcon size={16} /><p>Diretório: {directoryMatch ? 'Encontrado' : 'Não retornado no diretório carregado'}</p></div>
          </div>
        </article>
        <article className={styles.tablePanel}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Permissões</p>
              <h2>Escopo atual</h2>
              <p>Lista limitada para auditoria visual da V2.</p>
            </div>
          </header>
          <div className={styles.chips}>
            {(permissions.includes('*') ? ['*'] : permissions.slice(0, 40)).map((permission) => <span className={styles.chip} key={permission}>{permission}</span>)}
            {!permissions.length ? <span className={styles.chip}>Sem permissões diretas</span> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
