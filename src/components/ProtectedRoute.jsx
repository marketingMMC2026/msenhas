import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ProtectedRoute = ({ children }) => {
  const { user, loading, error } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" message="Verificando permissões..." />
      </div>
    );
  }

  // If there's an authentication error (like invalid domain), show it
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-red-100 text-center">
           <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-red-600 mb-2">Acesso Negado</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={() => window.location.href = '/login'} variant="outline" className="w-full">
            Voltar para Login
          </Button>
        </div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login but save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;