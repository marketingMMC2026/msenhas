import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ScrollToTop from '@/components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProtectedAdminRoute from '@/components/ProtectedAdminRoute';
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
        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        
        {/* Protected routes wrapped in AppShell */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          {/* General User Routes */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/requests" element={<ProtectedRoute><RequestsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<SettingsPage />} />
          
          {/* Admin Routes */}
          <Route path="/groups" element={
            <ProtectedAdminRoute>
              <GroupsPage />
            </ProtectedAdminRoute>
          } />
          
          <Route path="/users" element={
            <ProtectedAdminRoute>
              <UsersPage />
            </ProtectedAdminRoute>
          } />
          
          <Route path="/logs" element={
            <ProtectedAdminRoute>
              <LogsPage />
            </ProtectedAdminRoute>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;