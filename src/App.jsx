// ================================================================
//  App
//  [Fase 2] /preencher-semana agora aponta para a tela real.
// ================================================================

import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AppShell from './components/shell/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import CentralPage from './pages/CentralPage.jsx';
import RetentionSquadDashboardPage from './pages/RetentionSquadDashboardPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ModeloOficialPage from './pages/ModeloOficialPage.jsx';
import GdvPage from './pages/GdvPage.jsx';
import PreencherSemanaPage from './pages/PreencherSemanaPage.jsx';
import SquadPage from './pages/SquadPage.jsx';
import SquadRankingPage from './pages/SquadRankingPage.jsx';
import GdvRankingPage from './pages/GdvRankingPage.jsx';
import TrafficManagementPage from './pages/TrafficManagementPage.jsx';
import TeamAccessPage from './pages/TeamAccessPage.jsx';
import SupportTechnologyPage from './pages/SupportTechnologyPage.jsx';
import ForbiddenPage from './pages/ForbiddenPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import UserProfilePage from './pages/UserProfilePage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import DesignLabClientsPage from './pages/design-lab/DesignLabClientsPage.jsx';
import DesignLabDashboardPage from './pages/design-lab/DesignLabDashboardPage.jsx';
import DesignLabPreencherSemanaPage from './pages/design-lab/DesignLabPreencherSemanaPage.jsx';
import RequirePermissionRoute from './routes/RequirePermissionRoute.jsx';

const SafeMigrationPage = lazy(() => import('./pages/v2/SafeMigrationPage.jsx'));
const ClientsV2Page = lazy(() => import('./pages/v2/ClientsV2Page.jsx'));
const OfficialModelV2Page = lazy(() => import('./pages/v2/OfficialModelV2Page.jsx'));
const TeamV2Page = lazy(() => import('./pages/v2/TeamV2Page.jsx'));
const TrafficV2Page = lazy(() => import('./pages/v2/TrafficV2Page.jsx'));
const DashboardV2Page = lazy(() => import('./pages/v2/DashboardV2Page.jsx'));
const RetentionV2Page = lazy(() => import('./pages/v2/RetentionV2Page.jsx'));
const RankingsV2Page = lazy(() => import('./pages/v2/RankingsV2Page.jsx'));
const WeeklyV2Page = lazy(() => import('./pages/v2/WeeklyV2Page.jsx'));
const SquadsV2Page = lazy(() => import('./pages/v2/SquadsV2Page.jsx'));
const GdvsV2Page = lazy(() => import('./pages/v2/GdvsV2Page.jsx'));
const ProjectsV2Page = lazy(() => import('./pages/v2/ProjectsV2Page.jsx'));
const ProfileV2Page = lazy(() => import('./pages/v2/ProfileV2Page.jsx'));
const WorkspaceV2Page = lazy(() => import('./pages/v2/WorkspaceV2Page.jsx'));
const SupportV2Page = lazy(() => import('./pages/v2/SupportV2Page.jsx'));
const V2OverviewPage = lazy(() => import('./pages/v2/V2OverviewPage.jsx'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/espaco-trabalho"
              element={
                <ProtectedRoute>
                  <WorkspacePage />
                </ProtectedRoute>
              }
            />

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
                path="dashboard/indicadores-por-squad"
                element={<RequirePermissionRoute permission="central.view"><RetentionSquadDashboardPage /></RequirePermissionRoute>}
              />
              <Route
                path="clientes"
                element={<RequirePermissionRoute permission="clients.view"><DesignLabClientsPage /></RequirePermissionRoute>}
              />
              <Route path="v2" element={<Navigate to="/v2/visao-geral" replace />} />
              <Route
                path="v2/plano-migracao"
                element={
                  <RequirePermissionRoute permission="team.view">
                    <Suspense fallback={null}>
                      <SafeMigrationPage />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/clientes"
                element={
                  <RequirePermissionRoute permission="clients.view">
                    <Suspense fallback={null}>
                      <ClientsV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/modelo-oficial"
                element={
                  <RequirePermissionRoute permission="project_template.view">
                    <Suspense fallback={null}>
                      <OfficialModelV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/equipe"
                element={
                  <RequirePermissionRoute permission="team.view">
                    <Suspense fallback={null}>
                      <TeamV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/gestao-trafego"
                element={
                  <RequirePermissionRoute permission="metrics.view">
                    <Suspense fallback={null}>
                      <TrafficV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/dashboard"
                element={
                  <RequirePermissionRoute permission="central.view">
                    <Suspense fallback={null}>
                      <DashboardV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/retencao"
                element={
                  <RequirePermissionRoute permission="central.view">
                    <Suspense fallback={null}>
                      <RetentionV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/rankings"
                element={
                  <RequirePermissionRoute permission="ranking.view">
                    <Suspense fallback={null}>
                      <RankingsV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/preencher-semana"
                element={
                  <RequirePermissionRoute permission="metrics.view">
                    <Suspense fallback={null}>
                      <WeeklyV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/squads"
                element={
                  <RequirePermissionRoute permission="squads.view">
                    <Suspense fallback={null}>
                      <SquadsV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/gdvs"
                element={
                  <RequirePermissionRoute permission="ranking.view">
                    <Suspense fallback={null}>
                      <GdvsV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/visao-geral"
                element={
                  <RequirePermissionRoute permission="central.view">
                    <Suspense fallback={null}>
                      <V2OverviewPage />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/projetos"
                element={
                  <RequirePermissionRoute permission="projects.view">
                    <Suspense fallback={null}>
                      <ProjectsV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/perfil"
                element={
                  <RequirePermissionRoute permission="profile.view">
                    <Suspense fallback={null}>
                      <ProfileV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/workspace"
                element={
                  <RequirePermissionRoute permission="profile.view">
                    <Suspense fallback={null}>
                      <WorkspaceV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route
                path="v2/suporte-tecnologia"
                element={
                  <RequirePermissionRoute permission="support.view">
                    <Suspense fallback={null}>
                      <SupportV2Page />
                    </Suspense>
                  </RequirePermissionRoute>
                }
              />
              <Route path="design-lab" element={<Navigate to="/design-lab/dashboard" replace />} />
              <Route
                path="design-lab/dashboard"
                element={<RequirePermissionRoute permission="central.view"><DesignLabDashboardPage /></RequirePermissionRoute>}
              />
              <Route
                path="design-lab/clientes"
                element={<RequirePermissionRoute permission="clients.view"><DesignLabClientsPage /></RequirePermissionRoute>}
              />
              <Route
                path="design-lab/preencher-semana"
                element={<RequirePermissionRoute permission="metrics.view"><DesignLabPreencherSemanaPage /></RequirePermissionRoute>}
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
              <Route path="gdvs/:gdvId" element={<RequirePermissionRoute permission="gdv.view"><GdvPage /></RequirePermissionRoute>} />
              <Route path="perfil" element={<RequirePermissionRoute permission="profile.view"><ProfilePage /></RequirePermissionRoute>} />
              <Route path="perfil/:userId" element={<RequirePermissionRoute permission="profile.view"><UserProfilePage /></RequirePermissionRoute>} />
              <Route path="squads/:squadId" element={<RequirePermissionRoute permission="squads.view"><SquadPage /></RequirePermissionRoute>} />
              <Route path="ranking-squads" element={<RequirePermissionRoute permission="ranking.view"><SquadRankingPage /></RequirePermissionRoute>} />
              <Route path="ranking-gdvs" element={<RequirePermissionRoute permission="ranking.view"><GdvRankingPage /></RequirePermissionRoute>} />
              <Route path="gestao-trafego" element={<RequirePermissionRoute permission="metrics.view"><TrafficManagementPage /></RequirePermissionRoute>} />
              <Route path="suporte-tecnologia" element={<RequirePermissionRoute permission="support.view"><SupportTechnologyPage /></RequirePermissionRoute>} />
              <Route path="equipe" element={<RequirePermissionRoute permission="team.view"><TeamAccessPage /></RequirePermissionRoute>} />
              <Route path="acesso-negado" element={<ForbiddenPage />} />
              <Route
                path="modelo-oficial"
                element={<RequirePermissionRoute permission="project_template.view"><ModeloOficialPage /></RequirePermissionRoute>}
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
