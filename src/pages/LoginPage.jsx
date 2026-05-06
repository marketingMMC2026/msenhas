import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Lock, Loader2, AlertTriangle, Mail } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, signInWithEmail, loading } = useAuth();
  
  const configValid = isSupabaseConfigured();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      console.log('[LoginPage] Initiating Google OAuth to:', redirectUrl);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error('Google login error:', error);
      setIsGoogleLoading(false);
      toast({
        title: 'Falha no login Google',
        description: error.message || 'Não foi possível conectar ao provedor.',
        variant: 'destructive'
      });
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      await signInWithEmail(email, password);
    } catch (error) {
      console.error('Email login error:', error);
      let msg = 'Erro ao realizar login.';
      if (error.message.includes('Invalid login credentials')) msg = 'Email ou senha incorretos.';
      toast({
        title: 'Erro de Acesso',
        description: msg,
        variant: 'destructive'
      });
    }
  };

  return (
    <>
      <Helmet>
        <title>Login - MSENHAS</title>
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          
          {!configValid && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg shadow-sm mb-4">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                <div className="ml-3">
                  <h3 className="text-sm font-bold text-yellow-800">CONFIGURAÇÃO INCOMPLETA</h3>
                  <p className="text-sm text-yellow-700 mt-1">Variáveis de ambiente do Supabase ausentes.</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mb-4">
                <Lock className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">MSENHAS</h1>
              <p className="text-gray-600">Acesse sua conta segura</p>
            </div>

            <Tabs.Root defaultValue="google" className="w-full">
              <Tabs.List className="flex border-b border-gray-200 mb-6">
                <Tabs.Trigger value="google" className="flex-1 pb-3 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 transition-colors">
                  Google Workspace
                </Tabs.Trigger>
                <Tabs.Trigger value="email" className="flex-1 pb-3 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 transition-colors">
                  Email / Senha
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="google" className="focus:outline-none">
                <Button onClick={handleGoogleLogin} disabled={!configValid || loading || isGoogleLoading} className="w-full bg-white hover:bg-gray-50 text-gray-900 font-medium py-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-3">
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      <span>Conectando...</span>
                    </>
                  ) : (
                    <>
                      <span>Entrar com Google</span>
                    </>
                  )}
                </Button>
                <p className="mt-4 text-center text-xs text-gray-400">
                  Recomendado para usuários com email corporativo.
                </p>
              </Tabs.Content>

              <Tabs.Content value="email" className="focus:outline-none">
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="relative">
                       <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                       <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="seu@email.com" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                    <div className="relative">
                       <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                       <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••••" />
                    </div>
                  </div>
                  
                  <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
                  </Button>
                </form>
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </div>
      </div>
    </>
  );
};
export default LoginPage;