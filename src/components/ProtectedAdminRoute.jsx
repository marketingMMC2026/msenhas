import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AccessDenied from '@/components/AccessDenied';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ProtectedAdminRoute = ({ children }) => {
  const { user, isAdmin, loading, loadingProfile, profileLoadError } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // 1. Loading State (Auth or Profile)
  if (loading || loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" message="Carregando perfil..." />
      </div>
    );
  }

  // 2. Not Authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // 3. Profile Load Error (Optional but good for debugging)
  if (profileLoadError) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-red-100 text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                    <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <h2 className="text-xl font-semibold text-red-600 mb-2">Falha ao carregar perfil</h2>
                <p className="text-gray-600 mb-6">{profileLoadError}</p>
                <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
                    Tentar Novamente
                </Button>
            </div>
        </div>
     );
  }

  // 4. Authenticated but Not Admin
  if (!isAdmin) {
    return (
        <AccessDenied 
            message="Acesso restrito a administradores." 
            actionLabel="Voltar para Dashboard"
            onAction={() => navigate('/dashboard')}
        />
    );
  }

  // 5. Authenticated and Admin
  return children;
};

export default ProtectedAdminRoute;