import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { canAccessAdmin } from '../utils/permissions.js';

export default function RequireAdminRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!canAccessAdmin(user)) {
    return (
      <Navigate
        to="/acesso-negado"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  return children;
}
