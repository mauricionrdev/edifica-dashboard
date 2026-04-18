// ================================================================
//  Topbar
//  Barra superior sticky. A estética principal vem de .tbar no base.css.
//  Mantém slots globais e concentra a área de conta para desafogar a sidebar.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleLabel } from '../../utils/roles.js';
import { ChevronDownIcon, LogOutIcon, SearchIcon } from '../ui/Icons.jsx';
import styles from './Topbar.module.css';

const STATIC_RESULTS = [
  { id: 'dashboard', type: 'Pagina', label: 'Dashboard', detail: 'Visao central', to: '/' },
  { id: 'clientes', type: 'Pagina', label: 'Clientes', detail: 'Cadastro e carteira', to: '/clientes' },
  { id: 'preencher-semana', type: 'Pagina', label: 'Preencher Semana', detail: 'Rotina operacional', to: '/preencher-semana' },
  { id: 'gdv', type: 'Pagina', label: 'GDV', detail: 'Analises', to: '/gdv' },
  { id: 'equipe', type: 'Pagina', label: 'Equipe & Acessos', detail: 'Administracao', to: '/equipe' },
  { id: 'modelo-oficial', type: 'Pagina', label: 'Modelo Oficial', detail: 'Template de tarefas', to: '/modelo-oficial' },
];

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarUrl(user) {
  return (
    user?.avatarUrl
    || user?.avatar
    || user?.photoUrl
    || user?.picture
    || user?.imageUrl
    || ''
  );
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

export default function Topbar({
  banner = null,
  actions = null,
  clients = [],
  squads = [],
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const avatarSrc = useMemo(() => avatarUrl(user), [user]);
  const canShowAvatar = Boolean(avatarSrc) && !avatarFailed;
  const searchResults = useMemo(() => {
    const q = normalize(searchValue);
    if (!q) return [];

    const clientResults = (Array.isArray(clients) ? clients : []).map((client) => ({
      id: `client-${client.id}`,
      type: 'Cliente',
      label: client.name || 'Cliente sem nome',
      detail: [client.squadName, client.gestor, client.gdvName].filter(Boolean).join(' | '),
      to: `/clientes?search=${encodeURIComponent(client.name || '')}&client=${encodeURIComponent(client.id)}`,
      haystack: [client.name, client.squadName, client.gestor, client.gdvName],
    }));

    const squadResults = (Array.isArray(squads) ? squads : []).map((squad) => ({
      id: `squad-${squad.id}`,
      type: 'Squad',
      label: squad.name || 'Squad sem nome',
      detail: 'Carteira do squad',
      to: `/squads/${encodeURIComponent(squad.id)}`,
      haystack: [squad.name],
    }));

    return [...clientResults, ...squadResults, ...STATIC_RESULTS]
      .filter((item) => {
        const fields = item.haystack || [item.label, item.detail, item.type];
        return fields.filter(Boolean).some((field) => normalize(field).includes(q));
      })
      .slice(0, 8);
  }, [clients, squads, searchValue]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarSrc]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function goToResult(result) {
    if (!result?.to) return;
    navigate(result.to);
    setSearchOpen(false);
    setSearchValue('');
  }

  function submitSearch(event) {
    event.preventDefault();
    const firstResult = searchResults[0];
    if (firstResult) {
      goToResult(firstResult);
      return;
    }

    const q = searchValue.trim();
    if (q) {
      navigate(`/clientes?search=${encodeURIComponent(q)}`);
      setSearchOpen(false);
      setSearchValue('');
    }
  }

  return (
    <header className="tbar">
      <div className="tbar-leading">
        <form
          className={styles.searchBox}
          ref={searchRef}
          onSubmit={submitSearch}
          role="search"
        >
          <input
            type="search"
            value={searchValue}
            onChange={(event) => {
              setSearchValue(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => {
              if (searchValue.trim()) setSearchOpen(true);
            }}
            placeholder="Buscar"
            aria-label="Buscar clientes, squads e paginas"
          />
          <button type="submit" className={styles.searchButton} aria-label="Buscar">
            <SearchIcon size={16} strokeWidth={1.7} />
          </button>

          {searchOpen && searchValue.trim() && (
            <div className={styles.searchResults}>
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className={styles.searchResult}
                    onClick={() => goToResult(result)}
                  >
                    <span>
                      <strong>{result.label}</strong>
                      <small>{result.detail || result.type}</small>
                    </span>
                    <em>{result.type}</em>
                  </button>
                ))
              ) : (
                <button type="submit" className={styles.searchEmpty}>
                  Buscar por "{searchValue.trim()}" em Clientes
                </button>
              )}
            </div>
          )}
        </form>
      </div>

      <div className="tbar-center">
        {banner}
      </div>

      <div className="tbar-actions">
        {actions}
        <div className={styles.accountCluster} ref={menuRef}>
          <button
            type="button"
            className={styles.profileButton}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Abrir menu do perfil"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className={styles.accountAvatar} aria-hidden="true">
              {canShowAvatar ? (
                <img
                  src={avatarSrc}
                  alt=""
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                initials(user?.name)
              )}
            </span>
          <span className={styles.accountMeta}>
            <strong title={user?.name || ''}>{user?.name || 'Usuário'}</strong>
            <span>{roleLabel(user?.role)}</span>
          </span>
            <ChevronDownIcon size={15} strokeWidth={1.8} className={styles.chevron} />
          </button>
          {menuOpen && (
            <div className={styles.profileMenu} role="menu">
              <div className={styles.profileMenuHeader}>
                <strong>{user?.name || 'Usuario'}</strong>
                <span>{roleLabel(user?.role)}</span>
              </div>
              <button
                type="button"
                className={styles.logoutButton}
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                aria-label="Sair da conta"
                title="Sair"
                role="menuitem"
              >
                <LogOutIcon size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
