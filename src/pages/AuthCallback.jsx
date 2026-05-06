import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/supabase';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const processAuth = async () => {
      try {
        // 1. Get session (CRITICAL ONLY)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          throw new Error('Nenhuma sessão encontrada. Tente fazer login novamente.');
        }

        console.log('[AuthCallback] Session found, redirecting to dashboard...');
        
        // 2. If session exists, we trust useAuth hook in Dashboard to handle profile loading
        // We do NOT wait for profile here to prevent getting stuck if profile fetch fails (e.g. 500 error)
        navigate('/dashboard', { replace: true });

      } catch (err) {
        console.error('[AuthCallback] Error processing callback:', err);
        setError(err.message || 'Erro ao processar login.');
      }
    };

    processAuth();
  }, [navigate]);

  const handleBackToLogin = () => {
    navigate('/login');
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <Helmet>
          <title>Erro de Autenticacao - MSENHAS</title>
        </Helmet>
        <div className="text-center max-w-lg bg-white p-8 rounded-lg shadow-lg border border-red-100">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Falha na Autenticação</h2>
          <div className="bg-red-50 p-4 rounded-md text-left mb-6">
            <p className="text-sm font-medium text-red-800 mb-1">Detalhes do Erro:</p>
            <p className="text-sm text-red-600 break-words">{error}</p>
          </div>
          <Button onClick={handleBackToLogin} className="w-full bg-gray-900 hover:bg-gray-800 gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar para Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 relative">
       <Helmet>
          <title>Processando Login...</title>
       </Helmet>
       <LoadingSpinner size="lg" message="Finalizando autenticação..." />
    </div>
  );
};

export default AuthCallback;
