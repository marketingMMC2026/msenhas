import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ScrollToTop from '@/components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProtectedCapabilityRoute from '@/components/ProtectedCapabilityRoute';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
// Entrada (não-autenticada) fica eager; o resto carrega sob demanda (code-splitting).
import LoginPage from '@/pages/LoginPage';
import AuthCallback from '@/pages/AuthCallback';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const VaultPage = lazy(() => import('@/pages/VaultPage'));
const RequestsPage = lazy(() => import('@/pages/RequestsPage'));
const GroupsPage = lazy(() => import('@/pages/GroupsPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const LogsPage = lazy(() => import('@/pages/LogsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <LoadingSpinner size="lg" message="Carregando..." />
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/requests" element={<RequestsPage />} />

          <Route path="/groups" element={
            <ProtectedCapabilityRoute capability="manageGroups" message="Seu perfil nao permite gerenciar grupos.">
              <GroupsPage />
            </ProtectedCapabilityRoute>
          } />

          <Route path="/users" element={
            <ProtectedCapabilityRoute capability="manageUsers" message="Seu perfil nao permite gerenciar usuarios e convites.">
              <UsersPage />
            </ProtectedCapabilityRoute>
          } />

          <Route path="/logs" element={
            <ProtectedCapabilityRoute capability="viewLogs" message="Seu perfil nao permite visualizar logs.">
              <LogsPage />
            </ProtectedCapabilityRoute>
          } />

          <Route path="/settings" element={
            <ProtectedCapabilityRoute capability="manageSettings" message="Somente administradores acessam configuracoes globais.">
              <SettingsPage />
            </ProtectedCapabilityRoute>
          } />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
