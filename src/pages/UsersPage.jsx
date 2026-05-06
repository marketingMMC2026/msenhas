import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Info } from 'lucide-react';

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();

  const [togglingAdmin, setTogglingAdmin] = useState({});
  const [togglingActive, setTogglingActive] = useState({});

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
      toast({ 
        variant: "destructive", 
        title: "Erro ao carregar usuários", 
        description: err.message 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (targetUser) => {
    if (targetUser.id === currentUser.id && targetUser.is_admin) {
        toast({
            variant: "destructive",
            title: "Ação bloqueada",
            description: "Você não pode remover seu próprio acesso de administrador."
        });
        return;
    }

    const newStatus = !targetUser.is_admin;
    setTogglingAdmin(prev => ({ ...prev, [targetUser.id]: true }));

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: newStatus })
        .eq('id', targetUser.id);

      if (error) throw error;

      setUsers(users.map(u => u.id === targetUser.id ? { ...u, is_admin: newStatus } : u));
      
      await logAction('toggle_admin', 'user', targetUser.id, { new_status: newStatus });

      toast({
        title: "Permissão atualizada",
        description: `O usuário ${targetUser.email} agora ${newStatus ? 'é' : 'não é mais'} administrador.`
      });

    } catch (err) {
      console.error('Error toggling admin:', err);
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: err.message
      });
    } finally {
      setTogglingAdmin(prev => ({ ...prev, [targetUser.id]: false }));
    }
  };

  const handleToggleActive = async (targetUser) => {
    if (targetUser.id === currentUser.id) {
        toast({
            variant: "destructive",
            title: "Ação bloqueada",
            description: "Você não pode desativar sua própria conta."
        });
        return;
    }

    const newStatus = !targetUser.is_active;
    setTogglingActive(prev => ({ ...prev, [targetUser.id]: true }));

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: newStatus })
        .eq('id', targetUser.id);

      if (error) throw error;

      setUsers(users.map(u => u.id === targetUser.id ? { ...u, is_active: newStatus } : u));
      
      await logAction('toggle_active', 'user', targetUser.id, { new_status: newStatus });

      toast({
        title: "Status atualizado",
        description: `O usuário ${targetUser.email} foi ${newStatus ? 'ativado' : 'desativado'}.`
      });

    } catch (err) {
      console.error('Error toggling active:', err);
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: err.message
      });
    } finally {
      setTogglingActive(prev => ({ ...prev, [targetUser.id]: false }));
    }
  };

  return (
    <>
      <Helmet>
        <title>Usuarios - MSENHAS</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Usuários</h1>
            <p className="text-gray-600 mt-2">Administre o acesso e as permissões do sistema.</p>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
            <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                    <h3 className="text-sm font-medium text-blue-800">Criação de Usuários</h3>
                    <p className="text-sm text-blue-700 mt-1">
                        ℹ️ Criação de Usuários: Usuários entram automaticamente via primeiro login com Google. 
                        Contas manuais devem ser criadas no Supabase Auth, em Authentication &gt; Users &gt; Add User.
                    </p>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <LoadingSpinner size="lg" text="Carregando usuários..." className="py-12" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700">Email</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-center w-32">Admin</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-center w-32">Ativo</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-right">Cadastrado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{u.full_name || 'Sem nome'}</div>
                          <div className="text-gray-500">{u.email}</div>
                          {u.id === currentUser.id && (
                              <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  Você
                              </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center">
                            <input
                                type="checkbox"
                                checked={u.is_admin || false}
                                onChange={() => handleToggleAdmin(u)}
                                disabled={togglingAdmin[u.id]}
                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center">
                             <input
                                type="checkbox"
                                checked={u.is_active || false}
                                onChange={() => handleToggleActive(u)}
                                disabled={togglingActive[u.id]}
                                className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-gray-500">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default UsersPage;
