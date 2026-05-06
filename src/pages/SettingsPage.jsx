import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Settings, Save, User, Shield, Activity, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';

const SettingsPage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');

  // Initialize form data when profile is loaded
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
    } else if (user?.user_metadata?.full_name) {
      setFullName(user.user_metadata.full_name);
    }
  }, [profile, user]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({
        variant: "destructive",
        title: "Campo obrigatório",
        description: "O nome completo não pode estar vazio."
      });
      return;
    }

    if (!user?.id) {
       toast({
         variant: "destructive",
         title: "Erro de sessão",
         description: "Sessão inválida. Tente recarregar a página."
       });
       return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      await logAction('update_profile', 'profile', user.id, { full_name: fullName.trim() });

      toast({
        title: "Sucesso",
        description: "Configurações de perfil atualizadas com sucesso."
      });
      
    } catch (err) {
      console.error('Error updating settings:', {
        status: err.code,
        code: err.code,
        message: err.message
      });
      
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: err.message || "Não foi possível salvar as alterações."
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Configurações - MSENHAS</title>
        <meta name="description" content="Configure sua conta e preferências do sistema." />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurações</h1>
          <p className="text-gray-600">Configure sua conta e preferências do sistema.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <Settings className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Perfil do Usuário</h2>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
            
            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-500" />
                        Email (Apenas Leitura)
                    </Label>
                    <Input 
                        id="email" 
                        value={user?.email || ''} 
                        disabled 
                        className="bg-gray-50 text-gray-500 border-gray-200"
                    />
                    <p className="text-xs text-gray-400">O email é gerenciado pelo provedor de autenticação.</p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="fullName" className="flex items-center gap-2">
                         <User className="h-4 w-4 text-gray-900" />
                         Nome Completo
                    </Label>
                    <Input 
                        id="fullName" 
                        value={fullName} 
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Seu nome completo"
                        className="bg-white"
                    />
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 pt-4">
                <div className="space-y-2 p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <Label className="flex items-center gap-2 text-gray-700">
                        <Shield className="h-4 w-4 text-purple-600" />
                        Status de Administrador
                    </Label>
                    <div className="mt-2 flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${profile?.is_admin ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className="text-sm font-medium text-gray-900">
                            {profile?.is_admin ? 'Ativo (Admin)' : 'Usuário Padrão'}
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Permissões administrativas são gerenciadas por outros administradores.
                    </p>
                </div>

                <div className="space-y-2 p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <Label className="flex items-center gap-2 text-gray-700">
                        <Activity className="h-4 w-4 text-blue-600" />
                        Status da Conta
                    </Label>
                    <div className="mt-2 flex items-center gap-2">
                         <div className={`h-2.5 w-2.5 rounded-full ${profile?.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-sm font-medium text-gray-900">
                            {profile?.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Contas inativas não podem acessar o sistema.
                    </p>
                </div>
            </div>

            <div className="pt-4 flex justify-end">
                <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
                >
                {loading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                    </>
                ) : (
                    <>
                        <Save className="h-4 w-4 mr-2" />
                        Salvar Alterações
                    </>
                )}
                </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default SettingsPage;