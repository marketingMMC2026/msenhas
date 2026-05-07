import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import UserInviteModal from '@/components/UserInviteModal';
import { Info, MailPlus } from 'lucide-react';

const roleOptions = [
  { value: 'admin', label: 'Admin do sistema', description: 'Gerencia usuarios, grupos e senhas da agencia.' },
  { value: 'manager', label: 'Gestor', description: 'Convida usuarios, gerencia grupos, ve logs e organiza acessos. Nao importa senhas.' },
  { value: 'editor', label: 'Editor', description: 'Cria e edita senhas permitidas.' },
  { value: 'viewer', label: 'Visualizador', description: 'Apenas visualiza senhas compartilhadas.' },
];

const roleLabel = (role, isAdmin) => {
  if (isAdmin) return 'Admin do sistema';
  return roleOptions.find(option => option.value === role)?.label || 'Visualizador';
};

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const { user: currentUser, role: currentRole, isAdmin, can } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();

  const [updatingRole, setUpdatingRole] = useState({});
  const [togglingActive, setTogglingActive] = useState({});

  const availableRoleOptions = useMemo(() => {
    if (isAdmin) return roleOptions;
    return roleOptions.filter((option) => option.value !== 'admin');
  }, [isAdmin]);

  const groupNameById = useMemo(() => {
    const map = new Map();
    groups.forEach((group) => map.set(group.id, group.name));
    return map;
  }, [groups]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const [usersResult, groupsResult, invitesResult] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('groups').select('id, name').order('name'),
        supabase.from('user_invitations').select('*').order('invited_at', { ascending: false }),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (groupsResult.error) throw groupsResult.error;
      if (invitesResult.error && invitesResult.error.code !== '42P01') throw invitesResult.error;

      setUsers(usersResult.data || []);
      setGroups(groupsResult.data || []);
      setInvitations(invitesResult.error ? [] : (invitesResult.data || []));
    } catch (err) {
      console.error('Error fetching users:', err);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar usuarios',
        description: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (targetUser, nextRole) => {
    if (targetUser.id === currentUser.id && targetUser.is_admin && nextRole !== 'admin') {
      toast({
        variant: 'destructive',
        title: 'Acao bloqueada',
        description: 'Voce nao pode remover seu proprio acesso de administrador.'
      });
      return;
    }

    if (!isAdmin && (targetUser.is_admin || targetUser.role === 'admin' || nextRole === 'admin')) {
      toast({
        variant: 'destructive',
        title: 'Acao restrita ao Admin',
        description: 'Gestores podem criar e organizar usuarios, mas nao podem alterar administradores.'
      });
      return;
    }

    setUpdatingRole(prev => ({ ...prev, [targetUser.id]: true }));

    try {
      const payload = {
        role: nextRole,
        is_admin: nextRole === 'admin'
      };
      const { error } = await supabase.from('profiles').update(payload).eq('id', targetUser.id);
      if (error) throw error;

      setUsers(users.map(u => u.id === targetUser.id ? { ...u, ...payload } : u));
      await logAction('update_user_role', 'user', targetUser.id, { role: nextRole });

      toast({
        title: 'Perfil atualizado',
        description: `${targetUser.email} agora e ${roleLabel(nextRole, nextRole === 'admin')}.`
      });
    } catch (err) {
      console.error('Error updating role:', err);
      toast({ variant: 'destructive', title: 'Erro ao atualizar perfil', description: err.message });
    } finally {
      setUpdatingRole(prev => ({ ...prev, [targetUser.id]: false }));
    }
  };

  const handleToggleActive = async (targetUser) => {
    if (targetUser.id === currentUser.id) {
        toast({ variant: 'destructive', title: 'Acao bloqueada', description: 'Voce nao pode desativar sua propria conta.' });
        return;
    }

    if (!isAdmin && (targetUser.is_admin || targetUser.role === 'admin')) {
      toast({ variant: 'destructive', title: 'Acao restrita ao Admin', description: 'Gestores nao podem desativar administradores.' });
      return;
    }

    const newStatus = !targetUser.is_active;
    setTogglingActive(prev => ({ ...prev, [targetUser.id]: true }));

    try {
      const { error } = await supabase.from('profiles').update({ is_active: newStatus }).eq('id', targetUser.id);
      if (error) throw error;

      setUsers(users.map(u => u.id === targetUser.id ? { ...u, is_active: newStatus } : u));
      await logAction('toggle_active', 'user', targetUser.id, { new_status: newStatus });

      toast({ title: 'Status atualizado', description: `O usuario ${targetUser.email} foi ${newStatus ? 'ativado' : 'desativado'}.` });
    } catch (err) {
      console.error('Error toggling active:', err);
      toast({ variant: 'destructive', title: 'Erro ao atualizar', description: err.message });
    } finally {
      setTogglingActive(prev => ({ ...prev, [targetUser.id]: false }));
    }
  };

  const cancelInvitation = async (invitation) => {
    try {
      const { error } = await supabase
        .from('user_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitation.id);
      if (error) throw error;
      await fetchUsers();
      toast({ title: 'Convite cancelado', description: `O convite para ${invitation.email} foi cancelado.` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao cancelar convite', description: err.message });
    }
  };

  return (
    <>
      <Helmet>
        <title>Usuarios - M Password</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Usuarios</h1>
            <p className="text-gray-600 mt-2">Convide pessoas, defina grupos e controle o nivel operacional de cada acesso.</p>
          </div>
          {can('inviteUsers') && (
            <Button onClick={() => setInviteModalOpen(true)} className="bg-blue-600 text-white hover:bg-blue-700">
              <MailPlus className="mr-2 h-4 w-4" /> Convidar usuario
            </Button>
          )}
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-blue-800">Como funciona o acesso</h3>
              <p className="text-sm text-blue-700 mt-1">
                O login e feito apenas com Google. Se alguem entrar sem convite, acessa somente as proprias senhas. Para liberar senhas da equipe, o admin ou gestor cria um convite e seleciona os grupos antes do primeiro acesso.
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
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Convites</h2>
            <p className="mt-1 text-sm text-gray-500">Convites pendentes aplicam perfil e grupos quando a pessoa entra com Google.</p>
          </div>
          {loading ? (
            <LoadingSpinner size="lg" text="Carregando convites..." className="py-12" />
          ) : invitations.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-500">Nenhum convite criado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-gray-700">Pessoa</th>
                    <th className="px-6 py-3 font-semibold text-gray-700">Perfil</th>
                    <th className="px-6 py-3 font-semibold text-gray-700">Grupos</th>
                    <th className="px-6 py-3 font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 font-semibold text-gray-700 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {invitations.map((invite) => (
                    <tr key={invite.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4"><div className="font-medium text-gray-900">{invite.full_name || 'Sem nome'}</div><div className="text-gray-500">{invite.email}</div></td>
                      <td className="px-6 py-4">{roleLabel(invite.role, invite.role === 'admin')}</td>
                      <td className="px-6 py-4 text-gray-600">{(invite.group_ids || []).map((id) => groupNameById.get(id)).filter(Boolean).join(', ') || 'Nenhum grupo'}</td>
                      <td className="px-6 py-4"><span className={`rounded-full px-2 py-1 text-xs font-medium ${invite.status === 'accepted' ? 'bg-green-50 text-green-700' : invite.status === 'cancelled' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-50 text-yellow-700'}`}>{invite.status === 'accepted' ? 'Aceito' : invite.status === 'cancelled' ? 'Cancelado' : 'Pendente'}</span></td>
                      <td className="px-6 py-4 text-right">{invite.status === 'pending' && <Button variant="outline" size="sm" onClick={() => cancelInvitation(invite)}>Cancelar</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Usuarios ativos no sistema</h2>
            <p className="mt-1 text-sm text-gray-500">Seu perfil atual: {roleLabel(currentRole, currentRole === 'admin')}.</p>
          </div>
          {loading ? (
            <LoadingSpinner size="lg" text="Carregando usuarios..." className="py-12" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700">Usuario</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Perfil de acesso</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-center w-32">Ativo</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-right">Cadastrado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-12 text-center text-gray-500">Nenhum usuario encontrado.</td></tr>
                  ) : (
                    users.map((u) => {
                      const currentUserRole = u.is_admin ? 'admin' : (u.role || 'viewer');
                      const isProtectedAdmin = !isAdmin && currentUserRole === 'admin';
                      return (
                        <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{u.full_name || 'Sem nome'}</div>
                            <div className="text-gray-500">{u.email}</div>
                            <div className="mt-1 flex gap-2">
                              {u.id === currentUser.id && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Voce</span>}
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{u.domain}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <select value={currentUserRole} onChange={(event) => handleRoleChange(u, event.target.value)} disabled={updatingRole[u.id] || isProtectedAdmin} className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60">
                              {(isProtectedAdmin ? roleOptions : availableRoleOptions).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </td>
                          <td className="px-6 py-4 text-center"><div className="flex justify-center"><input type="checkbox" checked={u.is_active || false} onChange={() => handleToggleActive(u)} disabled={togglingActive[u.id] || isProtectedAdmin} className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all" /></div></td>
                          <td className="px-6 py-4 text-right text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
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

      <UserInviteModal open={inviteModalOpen} onOpenChange={setInviteModalOpen} onSuccess={fetchUsers} />
    </>
  );
};

export default UsersPage;
