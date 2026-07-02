import { Link, NavLink, useLocation } from 'react-router-dom';
import { V2_ROUTE_REGISTRY } from './v2RouteRegistry.js';
import styles from './V2Operations.module.css';

const PRIORITY_LINKS = [
  'validation',
  'promotion',
  'clients',
  'dashboard',
  'rankings',
  'retention',
  'traffic',
  'weekly',
  'squads',
  'gdvs',
  'model',
  'team',
];

function orderedRoutes() {
  const priority = new Map(PRIORITY_LINKS.map((key, index) => [key, index]));
  return [...V2_ROUTE_REGISTRY]
    .filter((route) => route.v2Path)
    .sort((a, b) => {
      const left = priority.has(a.key) ? priority.get(a.key) : 100 + V2_ROUTE_REGISTRY.indexOf(a);
      const right = priority.has(b.key) ? priority.get(b.key) : 100 + V2_ROUTE_REGISTRY.indexOf(b);
      return left - right;
    });
}

function resolveRoute(currentKey, pathname) {
  return V2_ROUTE_REGISTRY.find((route) => route.key === currentKey)
    || V2_ROUTE_REGISTRY.find((route) => route.v2Path === pathname)
    || V2_ROUTE_REGISTRY.find((route) => pathname.startsWith(`${route.v2Path}/`))
    || null;
}

export default function V2RouteNav({ currentKey }) {
  const location = useLocation();
  const current = resolveRoute(currentKey, location.pathname);
  const routes = orderedRoutes();

  return (
    <nav className={styles.v2Nav} aria-label="Navegação interna das rotas V2">
      <div className={styles.v2NavIntro}>
        <span className={styles.eyebrow}>Ambiente V2 paralelo</span>
        <strong>{current?.title || 'Rota V2'}</strong>
        <small>{current?.stage || 'Validação segura'} · {current?.risk || 'Risco controlado'}</small>
      </div>

      <div className={styles.v2NavLinks}>
        {routes.map((route) => (
          <NavLink
            key={route.key}
            to={route.v2Path}
            className={({ isActive }) => `${styles.v2NavLink} ${isActive ? styles.v2NavLinkActive : ''}`}
          >
            {route.title}
          </NavLink>
        ))}
      </div>

      <div className={styles.v2NavActions}>
        {current?.productionPath && current.productionPath !== '—' ? (
          <Link className={styles.v2NavAction} to={current.productionPath}>Ver produção</Link>
        ) : null}
        <Link className={styles.v2NavAction} to="/v2/validacao">Validar</Link>
        <Link className={styles.v2NavAction} to="/v2/promocao">Promoção</Link>
      </div>
    </nav>
  );
}
