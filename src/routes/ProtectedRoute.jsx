// ================================================================
//  ProtectedRoute
//  - Enquanto o AuthContext valida o token (status === 'loading'),
//    mostra um splash vazio em vez de redirecionar — evita o flash
//    do login ao dar refresh numa sessão válida.
//  - Se anônimo, redireciona para /login preservando a rota destino
//    em state.from (para redirecionar de volta após login).
// ================================================================

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#08090a',
        }}
      />
    );
  }
  if (status !== 'authed') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
