// ================================================================
//  App
//  [Fase 2] /preencher-semana agora aponta para a tela real.
// ================================================================

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AppShell from './components/shell/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import CentralPage from './pages/CentralPage.jsx';
import ClientsPage from './pages/ClientsPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ModeloOficialPage from './pages/ModeloOficialPage.jsx';
import GdvPage from './pages/GdvPage.jsx';
import PreencherSemanaPage from './pages/PreencherSemanaPage.jsx';
import SquadPage from './pages/SquadPage.jsx';
import SquadRankingPage from './pages/SquadRankingPage.jsx';
import TeamAccessPage from './pages/TeamAccessPage.jsx';
import ForbiddenPage from './pages/ForbiddenPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import UserProfilePage from './pages/UserProfilePage.jsx';
import RequireAdminRoute from './routes/RequireAdminRoute.jsx';
import RequirePermissionRoute from './routes/RequirePermissionRoute.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={<RequirePermissionRoute permission="central.view"><CentralPage /></RequirePermissionRoute>}
              />
              <Route
                path="clientes"
                element={<RequirePermissionRoute permission="clients.view"><ClientsPage /></RequirePermissionRoute>}
              />
              <Route
                path="projetos"
                element={<RequirePermissionRoute permission="projects.view"><ProjectsPage /></RequirePermissionRoute>}
              />
              <Route
                path="preencher-semana"
                element={<RequirePermissionRoute permission="metrics.view"><PreencherSemanaPage /></RequirePermissionRoute>}
              />
              <Route path="gdv" element={<RequirePermissionRoute permission="gdv.view"><GdvPage /></RequirePermissionRoute>} />
              <Route path="perfil" element={<RequirePermissionRoute permission="profile.view"><ProfilePage /></RequirePermissionRoute>} />
              <Route path="perfil/:userId" element={<RequirePermissionRoute permission="profile.view"><UserProfilePage /></RequirePermissionRoute>} />
              <Route path="squads/:squadId" element={<RequirePermissionRoute permission="squads.view"><SquadPage /></RequirePermissionRoute>} />
              <Route path="ranking-squads" element={<RequireAdminRoute><SquadRankingPage /></RequireAdminRoute>} />
              <Route path="equipe" element={<RequireAdminRoute><TeamAccessPage /></RequireAdminRoute>} />
              <Route path="acesso-negado" element={<ForbiddenPage />} />
              <Route
                path="modelo-oficial"
                element={<RequirePermissionRoute permission="projects.view"><ModeloOficialPage /></RequirePermissionRoute>}
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
