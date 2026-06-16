import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './ProtectedRoute.module.css';

function LoadingSplash() {
  return (
    <div className={styles.splash} role="status" aria-live="polite">
      <div className={styles.loader} aria-hidden="true" />
      <div className={styles.copy}>
        <strong>Carregando acesso</strong>
        <span>Validando sessão e permissões.</span>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingSplash />;
  }
  if (status !== 'authed') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
