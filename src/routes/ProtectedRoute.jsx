import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './ProtectedRoute.module.css';

function LoadingSplash({ showRecovery = false, onRetry }) {
  return (
    <div className={styles.splash} role="status" aria-live="polite">
      <div className={styles.loader} aria-hidden="true" />
      <div className={styles.copy}>
        <strong>Carregando acesso</strong>
        <span>Validando sessão e permissões.</span>
        {showRecovery ? (
          <button type="button" className={styles.retryButton} onClick={onRetry}>
            Tentar novamente
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const { status, reloadUser } = useAuth();
  const location = useLocation();
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    if (status !== 'loading') {
      setShowRecovery(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setShowRecovery(true), 8000);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (status === 'loading') {
    return (
      <LoadingSplash
        showRecovery={showRecovery}
        onRetry={() => {
          setShowRecovery(false);
          reloadUser().catch(() => {
            window.location.reload();
          });
        }}
      />
    );
  }
  if (status !== 'authed') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
