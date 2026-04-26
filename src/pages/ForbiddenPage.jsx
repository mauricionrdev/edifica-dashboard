import { Link, useLocation } from 'react-router-dom';
import StateBlock from '../components/ui/StateBlock.jsx';
import styles from './ForbiddenPage.module.css';

export default function ForbiddenPage() {
  const location = useLocation();
  const from = location.state?.from;

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
            <Link to="/" className={styles.primaryAction}>Voltar para a Central</Link>
            <Link to="/clientes" className={styles.secondaryAction}>Abrir Clientes</Link>
          </div>
        }
      />
    </div>
  );
}
