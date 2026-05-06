import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Lock, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const configValid = isSupabaseConfigured();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (user && !loading && !isGoogleLoading) {
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, location, isGoogleLoading]);

  const handleGoogleLogin = async () => {
    if (!configValid) return;
    setIsGoogleLoading(true);
    try {
      const origin = window.location.origin;
      const redirectUrl = `${origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, queryParams: { access_type: 'offline', prompt: 'consent' } }
      });
      if (error) throw error;
    } catch (error) {
      setIsGoogleLoading(false);
      toast({ title: 'Falha no login Google', description: error.message || 'Nao foi possivel conectar ao provedor.', variant: 'destructive' });
    }
  };

  return (
    <>
      <Helmet><title>Login - M Password</title></Helmet>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {!configValid && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg shadow-sm mb-4">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                <div className="ml-3">
                  <h3 className="text-sm font-bold text-yellow-800">CONFIGURACAO INCOMPLETA</h3>
                  <p className="text-sm text-yellow-700 mt-1">Variaveis de ambiente do Supabase ausentes.</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mb-4">
                <Lock className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">M Password</h1>
              <p className="text-gray-600">Acesse sua conta segura</p>
            </div>

            <Button onClick={handleGoogleLogin} disabled={!configValid || loading || isGoogleLoading} className="w-full bg-white hover:bg-gray-50 text-gray-900 font-medium py-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-3">
              {isGoogleLoading ? <><Loader2 className="h-5 w-5 animate-spin text-blue-600" /><span>Conectando...</span></> : <span>Entrar com Google</span>}
            </Button>
            <p className="mt-4 text-center text-xs text-gray-400">O acesso a senhas da equipe e grupos depende de convite do administrador.</p>
          </div>
        </div>
      </div>
    </>
  );
};
export default LoginPage;
