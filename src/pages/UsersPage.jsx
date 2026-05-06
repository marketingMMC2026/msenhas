import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Info } from 'lucide-react';

const roleOptions = [
  { value: 'admin', label: 'Admin do sistema', description: 'Gerencia usuários, grupos e senhas da agência.' },
  { value: 'manager', label: 'Gestor', description: 'Cria senhas, gerencia acessos e organiza grupos.' },
  { value: 'editor', label: 'Editor', description: 'Cria e edita senhas permitidas.' },
  { value: 'viewer', label: 'Visualizador', description: 'Apenas visualiza senhas compartilhadas.' },
];

const roleLabel = (role, isAdmin) => {
  if (isAdmin) return 'Admin do sistema';
  return roleOptions.find(option => option.value === role)?.label || 'Visualizador';
};

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();

  const [updatingRole, setUpdatingRole] = useState({});
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
      setUsers(data || []);
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

  const handleRoleChange = async (targetUser, nextRole) => {
    if (targetUser.id === currentUser.id && targetUser.is_admin && nextRole !== 'admin') {
      toast({
        variant: "destructive",
        title: "Ação bloqueada",
        description: "Você não pode remover seu próprio acesso de administrador."
      });
      return;
    }

    setUpdatingRole(prev => ({ ...prev, [targetUser.id]: true }));

    try {
      const payload = {
        role: nextRole,
        is_admin: nextRole === 'admin'
      };
      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', targetUser.id);

      if (error) throw error;

      setUsers(users.map(u => u.id === targetUser.id ? { ...u, ...payload } : u));
      await logAction('update_user_role', 'user', targetUser.id, { role: nextRole });

      toast({
        title: "Perfil atualizado",
        description: `${targetUser.email} agora é ${roleLabel(nextRole, nextRole === 'admin')}.`
      });
    } catch (err) {
      console.error('Error updating role:', err);
      toast({
        variant: "destructive",
        title: "Erro ao atualizar perfil",
        description: err.message
      });
    } finally {
      setUpdatingRole(prev => ({ ...prev, [targetUser.id]: false }));
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
        <title>Usuários - M Password</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Usuários</h1>
            <p className="text-gray-600 mt-2">Administre quem acessa o sistema e o nível operacional de cada pessoa.</p>
          </div>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-blue-800">Como funciona o acesso</h3>
              <p className="text-sm text-blue-700 mt-1">
                Usuários entram pelo Google Workspace ou email/senha. No primeiro login, o perfil é criado automaticamente com o domínio do email. Se VITE_ALLOWED_DOMAIN estiver definido, apenas emails desse domínio entram. Depois, o admin define o perfil: Admin, Gestor, Editor ou Visualizador.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {roleOptions.map(option => (
            <div key={option.value} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="font-semibold text-gray-900">{option.label}</p>
              <p className="mt-1 text-sm text-gray-500">{option.description}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <LoadingSpinner size="lg" text="Carregando usuários..." className="py-12" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700">Usuário</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Perfil de acesso</th>
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
                    users.map((u) => {
                      const currentRole = u.is_admin ? 'admin' : (u.role || 'viewer');
                      return (
                        <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{u.full_name || 'Sem nome'}</div>
                            <div className="text-gray-500">{u.email}</div>
                            <div className="mt-1 flex gap-2">
                              {u.id === currentUser.id && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Você</span>
                              )}
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{u.domain}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={currentRole}
                              onChange={(event) => handleRoleChange(u, event.target.value)}
                              disabled={updatingRole[u.id]}
                              className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                            >
                              {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
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
                      );
                    })
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
