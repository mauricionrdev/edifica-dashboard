import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getDefaultRouteForUser, hasPermission } from '../utils/permissions.js';

export default function RequirePermissionRoute({ permission, children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!permission || hasPermission(user, permission)) {
    return children;
  }

  return (
    <Navigate
      to={getDefaultRouteForUser(user)}
      replace
      state={{ blockedFrom: `${location.pathname}${location.search}${location.hash}` }}
    />
  );
}
