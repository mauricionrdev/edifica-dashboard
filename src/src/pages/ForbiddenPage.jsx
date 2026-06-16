import { Link, useLocation } from 'react-router-dom';
import StateBlock from '../components/ui/StateBlock.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { canViewClients, getDefaultRouteForUser } from '../utils/permissions.js';
import styles from './ForbiddenPage.module.css';

export default function ForbiddenPage() {
  const location = useLocation();
  const { user } = useAuth();
  const from = location.state?.from;
  const defaultRoute = getDefaultRouteForUser(user);
  const showClientsAction = canViewClients(user) && defaultRoute !== '/clientes';

  return (
    <div className={styles.page}>
      <StateBlock
        variant="error"
        title="Acesso restrito"
        description={
          from
            ? `Você não possui permissão para acessar ${from}.`
            : 'Você não possui permissão para acessar esta área.'
        }
        action={
          <div className={styles.actions}>
            <Link to={defaultRoute} className={styles.primaryAction}>Ir para tela permitida</Link>
            {showClientsAction ? <Link to="/clientes" className={styles.secondaryAction}>Abrir Clientes</Link> : null}
          </div>
        }
      />
    </div>
  );
}
