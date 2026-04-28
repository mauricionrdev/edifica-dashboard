import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './ProtectedRoute.module.css';

function LoadingSplash({ mode = 'loading', showRecovery = false, onRetry }) {
  const isError = mode === 'error';

  return (
    <div className={styles.splash} role={isError ? 'alert' : 'status'} aria-live="polite">
      <div className={isError ? styles.staticDot : styles.loader} aria-hidden="true" />
      <div className={styles.copy}>
        <strong>{isError ? 'Não foi possível validar o acesso' : 'Carregando acesso'}</strong>
        <span>
          {isError
            ? 'A sessão não foi encerrada. Tente validar novamente.'
            : 'Validando sessão e permissões.'}
        </span>
        {showRecovery || isError ? (
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
          reloadUser().catch(() => {});
        }}
      />
    );
  }

  if (status === 'auth_error') {
    return (
      <LoadingSplash
        mode="error"
        showRecovery
        onRetry={() => {
          reloadUser().catch(() => {});
        }}
      />
    );
  }

  if (status !== 'authed') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
