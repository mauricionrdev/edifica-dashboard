import { Navigate, Route, Routes } from 'react-router-dom';
import RequirePermissionRoute from '../routes/RequirePermissionRoute.jsx';
import { NewDataProvider } from './data/NewDataContext.jsx';
import NewShell from './layout/NewShell.jsx';
import NewDashboardPage from './pages/NewDashboardPage.jsx';
import NewClientsPage from './pages/NewClientsPage.jsx';
import './styles/tokens.css';
import './styles/frontend.css';

export default function NewFrontend() {
  return (
    <NewDataProvider>
      <Routes>
        <Route element={<NewShell />}>
          <Route
            index
            element={
              <RequirePermissionRoute permission="central.view">
                <NewDashboardPage />
              </RequirePermissionRoute>
            }
          />
          <Route
            path="clientes"
            element={
              <RequirePermissionRoute permission="clients.view">
                <NewClientsPage />
              </RequirePermissionRoute>
            }
          />
          <Route path="*" element={<Navigate to="/new" replace />} />
        </Route>
      </Routes>
    </NewDataProvider>
  );
}
