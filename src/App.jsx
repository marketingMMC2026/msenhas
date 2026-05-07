import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ScrollToTop from '@/components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProtectedCapabilityRoute from '@/components/ProtectedCapabilityRoute';
import AppShell from '@/components/AppShell';
import LoginPage from '@/pages/LoginPage';
import AuthCallback from '@/pages/AuthCallback';
import DashboardPage from '@/pages/DashboardPage';
import VaultPage from '@/pages/VaultPage';
import RequestsPage from '@/pages/RequestsPage';
import GroupsPage from '@/pages/GroupsPage';
import UsersPage from '@/pages/UsersPage';
import LogsPage from '@/pages/LogsPage';
import SettingsPage from '@/pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
    </BrowserRouter>
  );
}

export default App;
