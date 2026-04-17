// ================================================================
//  App
//  - Router principal:
//    /login               → LoginPage (público)
//    /                    → AppShell com Outlet (protegido)
//      index              → CentralPage
//      /clientes, /gdv, /preencher-semana, /squads/:id, /equipe
//                         → Placeholder por enquanto (próximos incrementos)
//  - AuthProvider envolve tudo para disponibilizar useAuth() em qualquer nó.
// ================================================================

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AppShell from './components/shell/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import CentralPage from './pages/CentralPage.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
            <Route index element={<CentralPage />} />
            <Route
              path="clientes"
              element={
                <PlaceholderPage
                  title="Clientes"
                  description="Tela de clientes em construção."
                />
              }
            />
            <Route
              path="preencher-semana"
              element={
                <PlaceholderPage
                  title="Preencher Semana"
                  description="Tela de preenchimento semanal em construção."
                />
              }
            />
            <Route
              path="gdv"
              element={
                <PlaceholderPage
                  title="GDV"
                  description="Análises de GDV em construção."
                />
              }
            />
            <Route
              path="squads/:squadId"
              element={
                <PlaceholderPage
                  title="Squad"
                  description="Dashboard de squad em construção."
                />
              }
            />
            <Route
              path="equipe"
              element={
                <PlaceholderPage
                  title="Equipe & Acessos"
                  description="Gestão de equipe em construção."
                />
              }
            />
            <Route
              path="modelo-oficial"
              element={
                <PlaceholderPage
                  title="Modelo Oficial"
                  description="Editor do template oficial de onboarding em construção."
                />
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
