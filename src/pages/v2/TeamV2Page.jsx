import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { listUsers } from '../../api/users.js';
import { BuildingIcon, SearchIcon, ShieldIcon, UsersIcon } from '../../components/ui/Icons.jsx';
import { roleLabel } from '../../utils/roles.js';
import styles from './TeamV2Page.module.css';

const STATUS_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'inactive', label: 'Inativos' },
];

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function initials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function userName(user) {
  return String(user?.name || user?.email || 'Usuário sem nome').trim();
}

function userEmail(user) {
  return String(user?.email || 'Sem e-mail').trim();
}

function userKey(user) {
  return String(user?.id || user?.email || userName(user));
}

function userRoles(user) {
  const secondary = Array.isArray(user?.secondaryRoles) ? user.secondaryRoles : [];
  return [user?.role, ...secondary].filter(Boolean);
}

function userSquadNames(user, squads) {
  const rawSquads = Array.isArray(user?.squads) ? user.squads : [];
  const squadList = Array.isArray(squads) ? squads : [];
  const labels = rawSquads.map((value) => {
    if (typeof value === 'object' && value?.name) return value.name;
    const match = squadList.find((squad) => String(squad?.id) === String(value));
    return match?.name || String(value || '').trim();
  }).filter(Boolean);
  return labels.length ? labels : ['Sem squad'];
}

function buildSummary(users, squads, gdvs) {
  const list = Array.isArray(users) ? users : [];
  return list.reduce(
    (acc, user) => {
      acc.total += 1;
      if (user?.active !== false) acc.active += 1;
      else acc.inactive += 1;
      if (user?.isMaster) acc.master += 1;
      userRoles(user).forEach((role) => {
        acc.byRole[role] = (acc.byRole[role] || 0) + 1;
      });
      return acc;
    },
    {
      total: 0,
      active: 0,
      inactive: 0,
      master: 0,
      squads: Array.isArray(squads) ? squads.length : 0,
      gdvs: Array.isArray(gdvs) ? gdvs.length : 0,
      byRole: {},
    }
  );
}

export default function TeamV2Page() {
  const { squads, gdvs, userDirectory, loading: shellLoading, error: shellError } = useOutletContext();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUserKey, setSelectedUserKey] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      setLoading(true);
      setError(null);
      try {
        const data = await listUsers();
        if (!cancelled) {
          const nextUsers = Array.isArray(data?.users) ? data.users : [];
          setUsers(nextUsers);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setUsers(Array.isArray(userDirectory) ? userDirectory : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [userDirectory]);

  const sourceUsers = users.length ? users : (Array.isArray(userDirectory) ? userDirectory : []);
  const summary = useMemo(() => buildSummary(sourceUsers, squads, gdvs), [sourceUsers, squads, gdvs]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return sourceUsers
      .filter((user) => {
        const isActive = user?.active !== false;
        if (statusFilter === 'active' && !isActive) return false;
        if (statusFilter === 'inactive' && isActive) return false;
        if (!normalizedQuery) return true;
        const haystack = normalizeText([
          userName(user),
          userEmail(user),
          userRoles(user).map(roleLabel).join(' '),
          userSquadNames(user, squads).join(' '),
        ].join(' '));
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => userName(a).localeCompare(userName(b), 'pt-BR'));
  }, [query, sourceUsers, squads, statusFilter]);

  const selectedUser = useMemo(() => {
    if (!filteredUsers.length) return null;
    if (!selectedUserKey) return filteredUsers[0];
    return filteredUsers.find((user) => userKey(user) === selectedUserKey) || filteredUsers[0];
  }, [filteredUsers, selectedUserKey]);

  const roleRows = useMemo(() => {
    return Object.entries(summary.byRole)
      .map(([role, count]) => ({ role, count, label: roleLabel(role) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
  }, [summary.byRole]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true">
          <UsersIcon size={20} />
        </div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Equipe V2 · rota paralela</p>
          <h1>Leitura segura da estrutura de acesso</h1>
          <p>
            Tela interna, somente leitura e fora da sidebar. Ela consulta apenas a listagem atual de usuários, squads e GDVs, sem criar usuário, sem editar permissões e sem substituir <strong>/equipe</strong>.
          </p>
        </div>
        <span className={styles.safeBadge}><ShieldIcon size={14} /> Sem ação destrutiva</span>
      </section>

      <section className={styles.metrics} aria-label="Resumo da equipe">
        <article className={styles.metricCard}>
          <span>Usuários</span>
          <strong>{summary.total}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Ativos</span>
          <strong>{summary.active}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Inativos</span>
          <strong>{summary.inactive}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Squads</span>
          <strong>{summary.squads}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>GDVs</span>
          <strong>{summary.gdvs}</strong>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Distribuição por função</h2>
              <p>Leitura consolidada dos papéis principais e secundários cadastrados.</p>
            </div>
            <BuildingIcon size={17} />
          </div>
          <div className={styles.roleList}>
            {roleRows.length ? roleRows.map((item) => (
              <div className={styles.roleRow} key={item.role}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
            )) : <p className={styles.stateText}>Nenhuma função carregada.</p>}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Validação da rota</h2>
              <p>Esta V2 serve para comparar estrutura e leitura antes de qualquer migração da tela oficial.</p>
            </div>
            <ShieldIcon size={17} />
          </div>
          <div className={styles.guardList}>
            <span>Não altera banco</span>
            <span>Não cria endpoint</span>
            <span>Não edita permissões</span>
            <span>Não substitui /equipe</span>
          </div>
        </article>
      </section>

      <section className={styles.toolbar} aria-label="Filtros de usuários">
        <label className={styles.searchBox}>
          <SearchIcon size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar usuário, e-mail, função ou squad"
          />
        </label>
        <div className={styles.filterGroup} aria-label="Filtrar por status">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.filterButton} ${statusFilter === item.key ? styles.filterButtonActive : ''}`}
              onClick={() => setStatusFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.teamGrid}>
        <article className={styles.tablePanel}>
          <div className={styles.tableHeader}>
            <div>
              <h2>Usuários carregados</h2>
              <p>{loading || shellLoading ? 'Carregando dados...' : `${filteredUsers.length} usuário${filteredUsers.length === 1 ? '' : 's'} nesta visão`}</p>
            </div>
            <span className={styles.readOnly}>Somente leitura</span>
          </div>

          {shellError || error ? (
            <div className={styles.stateBox}>A listagem foi carregada parcialmente. Valide a API antes de comparar esta V2 com a tela oficial.</div>
          ) : null}

          {!loading && !shellLoading && filteredUsers.length === 0 ? (
            <div className={styles.stateBox}>Nenhum usuário encontrado com os filtros atuais.</div>
          ) : null}

          {filteredUsers.length > 0 ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Funções</th>
                    <th>Squads</th>
                    <th>Status</th>
                    <th>Perfil</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const roles = userRoles(user);
                    const squadNames = userSquadNames(user, squads);
                    const active = user?.active !== false;
                    const key = userKey(user);
                    const selected = selectedUser ? userKey(selectedUser) === key : false;
                    return (
                      <tr
                        key={key}
                        className={selected ? styles.tableRowActive : ''}
                        onClick={() => setSelectedUserKey(key)}
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedUserKey(key); }}
                      >
                        <td>
                          <div className={styles.userCell}>
                            {user?.avatarUrl ? (
                              <img className={styles.avatarImage} src={user.avatarUrl} alt="" />
                            ) : (
                              <span className={styles.avatar}>{initials(userName(user))}</span>
                            )}
                            <div>
                              <strong>{userName(user)}</strong>
                              <small>{userEmail(user)}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.pillGroup}>
                            {roles.length ? roles.map((role) => <span className={styles.rolePill} key={role}>{roleLabel(role)}</span>) : <span className={styles.muted}>Sem função</span>}
                          </div>
                        </td>
                        <td>
                          <div className={styles.squadText}>{squadNames.slice(0, 3).join(', ')}{squadNames.length > 3 ? ` +${squadNames.length - 3}` : ''}</div>
                        </td>
                        <td><span className={`${styles.statusPill} ${active ? styles.statusActive : styles.statusInactive}`}>{active ? 'Ativo' : 'Inativo'}</span></td>
                        <td>{user?.customSlug ? <span className={styles.slug}>/{user.customSlug}</span> : <span className={styles.muted}>Sem link</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>

        <article className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{selectedUser ? userName(selectedUser) : 'Usuário selecionado'}</h2>
              <p>Detalhe somente leitura para validar papel, escopo e vínculos.</p>
            </div>
            <span className={styles.readOnly}>Sem edição</span>
          </div>
          {selectedUser ? (
            <div className={styles.detailBody}>
              <div className={styles.detailGrid}>
                <div><span>E-mail</span><strong>{userEmail(selectedUser)}</strong></div>
                <div><span>Status</span><strong>{selectedUser.active === false ? 'Inativo' : 'Ativo'}</strong></div>
                <div><span>Funções</span><strong>{userRoles(selectedUser).map(roleLabel).join(', ') || 'Sem função'}</strong></div>
                <div><span>Squads</span><strong>{userSquadNames(selectedUser, squads).join(', ')}</strong></div>
                <div><span>Perfil</span><strong>{selectedUser?.customSlug ? `/${selectedUser.customSlug}` : 'Sem link'}</strong></div>
                <div><span>Master</span><strong>{selectedUser?.isMaster ? 'Sim' : 'Não'}</strong></div>
              </div>
            </div>
          ) : <div className={styles.stateBox}>Selecione um usuário para validar o detalhe.</div>}
        </article>
      </section>
    </main>
  );
}
