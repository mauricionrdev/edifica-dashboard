// ================================================================
//  Sidebar
//  Visual: classes globais .sb / .sb-logo / .sb-nav / .ni / .nl / .sb-foot
//  do base.css (portado do frontend real, inclui refinamentos Stage 17).
//  Ícones: SVG do components/ui/Icons.jsx.
//
//  Driving: React Router (NavLink) + AuthContext. Zero callLegacy,
//  zero window.__edifica*, zero leitura de sidebarState global.
//
//  Estado ativo: derivado da URL via NavLink.className. Para seções
//  "Central/Dashboard" o real usava cor azul; "GDV" cor teal. Aqui
//  mapeamos com as classes `central` e `gdv-i` do base.css.
// ================================================================

import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdminUser } from '../../utils/roles.js';
import {
  BuildingIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  ShieldIcon,
  SparklesIcon,
  UsersIcon,
} from '../ui/Icons.jsx';
import styles from './Sidebar.module.css';

/**
 * Monta o className do item de nav seguindo as regras do base.css:
 *   - `.ni`                    - base
 *   - `.ni.central`            - variante azul (Central / Clientes)
 *   - `.ni.gdv-i`              - variante teal (GDV)
 *   - `.on`                    - sufixo de ativo
 */
function niClass(isActive, variant) {
  const parts = ['ni'];
  if (variant === 'central') parts.push('central');
  if (variant === 'gdv') parts.push('gdv-i');
  if (isActive) parts.push('on');
  return parts.join(' ');
}

/**
 * Props:
 *   clients  - Array<Client> (default [])
 *   squads   - Array<Squad>  (default [])
 *   onNavigate? - callback chamado ao clicar em qualquer item de nav
 *                 (útil para fechar drawer mobile no futuro)
 */
export default function Sidebar({ clients = [], squads = [], onNavigate }) {
  const { user } = useAuth();
  const admin = isAdminUser(user);

  const activeCount = clients.filter((c) => c.status !== 'churn').length;
  const total = clients.length;

  const userSquadIds = Array.isArray(user?.squads) ? user.squads : [];
  const visibleSquads = admin
    ? squads
    : squads.filter((s) => userSquadIds.includes(s.id));

  const handleNav = () => onNavigate?.();

  return (
    <aside className="sb" aria-label="Navegação principal">
      <div className="sb-logo">
        <div className={`sb-brand ${styles.brand}`}>
          <img
            className={styles.brandLogo}
            src="/brand/logotipo.svg"
            alt=""
            aria-hidden="true"
          />
          <div className={styles.brandText}>
            <span className="ltxt">
              Edifica<b>.</b>
            </span>
            <div className="sb-subtitle">Platform Control Center</div>
          </div>
        </div>
      </div>

      <nav className="sb-nav">
        <div className={styles.navInner}>
          {/* Central */}
          <div className="sb-section">
            <div className="nl">
              <span>Central</span>
            </div>
            <NavLink
              to="/"
              end
              onClick={handleNav}
              className={({ isActive }) =>
                `${niClass(isActive, 'central')} ${styles.itemLink}`
              }
            >
              <span className="nic">
                <LayoutDashboardIcon size={16} />
              </span>
              <span className={styles.itemLabel}>Dashboard</span>
              <span className="nbg">{activeCount}</span>
            </NavLink>
            <NavLink
              to="/clientes"
              onClick={handleNav}
              className={({ isActive }) =>
                `${niClass(isActive, 'central')} ${styles.itemLink}`
              }
            >
              <span className="nic">
                <BuildingIcon size={16} />
              </span>
              <span className={styles.itemLabel}>Clientes</span>
              <span className="nbg">{total}</span>
            </NavLink>
            <NavLink
              to="/preencher-semana"
              onClick={handleNav}
              className={({ isActive }) =>
                `${niClass(isActive)} ${styles.itemLink}`
              }
            >
              <span className="nic">
                <ClipboardListIcon size={16} />
              </span>
              <span className={styles.itemLabel}>Preencher Semana</span>
              <span className="nbg">{activeCount}</span>
            </NavLink>
          </div>

          {/* Análises */}
          <div className="sb-section">
            <div className="nl">
              <span>Análises</span>
            </div>
            <NavLink
              to="/gdv"
              onClick={handleNav}
              className={({ isActive }) =>
                `${niClass(isActive, 'gdv')} ${styles.itemLink}`
              }
            >
              <span className="nic">
                <SparklesIcon size={16} />
              </span>
              <span className={styles.itemLabel}>GDV</span>
              <span className="nbg">{total}</span>
            </NavLink>
          </div>

          {/* Squads */}
          <div className="sb-section">
            <div className="nl">
              <span>Squads</span>
              {admin && (
                <button
                  type="button"
                  className="nl-btn"
                  title="Novo squad (em breve)"
                  onClick={(e) => e.preventDefault()}
                >
                  +
                </button>
              )}
            </div>
            {visibleSquads.length === 0 ? (
              <div className={styles.empty}>Nenhum squad disponível</div>
            ) : (
              visibleSquads.map((sq) => {
                const count = clients.filter(
                  (c) => c.squadId === sq.id
                ).length;
                return (
                  <NavLink
                    key={sq.id}
                    to={`/squads/${encodeURIComponent(sq.id)}`}
                    onClick={handleNav}
                    className={({ isActive }) =>
                      `${niClass(isActive)} ${styles.itemLink}`
                    }
                  >
                    <span className="nd" aria-hidden="true" />
                    <span className={styles.itemLabel} title={sq.name}>
                      {sq.name}
                    </span>
                    <span className="nbg">{count}</span>
                  </NavLink>
                );
              })
            )}
          </div>

          {/* Administração */}
          {admin && (
            <div className="sb-section">
              <div className="nl">
                <span>Administração</span>
              </div>
              <NavLink
                to="/equipe"
                onClick={handleNav}
                className={({ isActive }) =>
                  `${niClass(isActive)} ${styles.itemLink}`
                }
              >
                <span className="nic">
                  <UsersIcon size={16} />
                </span>
                <span className={styles.itemLabel}>Equipe &amp; Acessos</span>
              </NavLink>
              <NavLink
                to="/modelo-oficial"
                onClick={handleNav}
                className={({ isActive }) =>
                  `${niClass(isActive)} ${styles.itemLink}`
                }
              >
                <span className="nic">
                  <ShieldIcon size={16} />
                </span>
                <span className={styles.itemLabel}>Modelo Oficial</span>
              </NavLink>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
