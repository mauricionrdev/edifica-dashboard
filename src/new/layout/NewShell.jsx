import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { hasPermission } from '../../utils/permissions.js';
import { roleLabel } from '../../utils/roles.js';

const ROUTE_META = [
  {
    match: (pathname) => pathname === '/new',
    eyebrow: 'Visão executiva',
    title: 'Dashboard',
    description: 'Receita, carteira e sinais de atenção em uma única leitura.',
  },
  {
    match: (pathname) => pathname.startsWith('/new/clientes'),
    eyebrow: 'Operação',
    title: 'Clientes',
    description: 'A carteira completa, organizada para decisões rápidas.',
  },
];

function initials(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'EC';
}

export default function NewShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const meta = useMemo(
    () => ROUTE_META.find((item) => item.match(location.pathname)) || ROUTE_META[0],
    [location.pathname]
  );

  const navigation = useMemo(
    () => [
      {
        to: '/new',
        label: 'Dashboard',
        icon: LayoutDashboard,
        end: true,
        visible: hasPermission(user, 'central.view'),
      },
      {
        to: '/new/clientes',
        label: 'Clientes',
        icon: UsersRound,
        visible: hasPermission(user, 'clients.view'),
      },
    ].filter((item) => item.visible),
    [user]
  );

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="new-app">
      <div
        className={`new-app__scrim ${menuOpen ? 'is-visible' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <aside className={`new-sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="new-sidebar__brand">
          <img src="/brand/logotipo.svg" alt="" aria-hidden="true" />
          <div>
            <strong>EDIFICA</strong>
            <span>Central</span>
          </div>
          <button
            type="button"
            className="new-icon-button new-sidebar__close"
            onClick={() => setMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="new-sidebar__workspace">
          <span className="new-sidebar__workspace-mark">EC</span>
          <div>
            <strong>Edifica Performance</strong>
            <span>Workspace operacional</span>
          </div>
          <ChevronRight size={15} />
        </div>

        <nav className="new-sidebar__nav" aria-label="Navegação principal">
          <p>Operação</p>
          {navigation.map(({ icon: Icon, ...item }) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (
                `new-sidebar__link ${isActive ? 'is-active' : ''}`
              )}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="new-sidebar__scope">
          <span>Escopo desta versão</span>
          <strong>2 módulos ativos</strong>
          <p>Novas rotas entram apenas após reconstrução e validação.</p>
        </div>

        <div className="new-sidebar__user">
          <span className="new-avatar">{initials(user?.name)}</span>
          <div>
            <strong>{user?.name || 'Usuário'}</strong>
            <span>{roleLabel(user?.role)}</span>
          </div>
          <button
            type="button"
            className="new-icon-button"
            onClick={logout}
            aria-label="Sair"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="new-shell">
        <header className="new-topbar">
          <button
            type="button"
            className="new-icon-button new-topbar__menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={19} />
          </button>

          <div className="new-topbar__route">
            <span>Central</span>
            <ChevronRight size={13} />
            <strong>{meta.title}</strong>
          </div>

          <div className="new-topbar__actions">
            <span className="new-release-badge">
              <Sparkles size={13} />
              Frontend novo
            </span>
          </div>
        </header>

        <main className="new-main">
          <header className="new-page-header">
            <div>
              <span className="new-eyebrow">{meta.eyebrow}</span>
              <h1>{meta.title}</h1>
              <p>{meta.description}</p>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
