import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import UserInviteModal from '@/components/UserInviteModal';
import { Info, MailPlus, Users as UsersIcon } from 'lucide-react';

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

const normalizeEmail = (email) => (email || '').trim().toLowerCase();

const statusMeta = {
  active: { label: 'Ativo', className: 'bg-green-50 text-green-700' },
  inactive: { label: 'Inativo', className: 'bg-gray-100 text-gray-600' },
  pending: { label: 'Convidado', className: 'bg-yellow-50 text-yellow-700' },
  accepted: { label: 'Aceito', className: 'bg-green-50 text-green-700' },
  cancelled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-600' },
};

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const { user: currentUser, role: currentRole, isAdmin, can } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();

  const [updatingRole, setUpdatingRole] = useState({});
  const [updatingGroups, setUpdatingGroups] = useState({});
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

  const activeGroupIdsByUser = useMemo(() => {
    const map = new Map();
    groupMembers.forEach((member) => {
      const current = map.get(member.user_id) || [];
      current.push(member.group_id);
      map.set(member.user_id, current);
    });
    return map;
  }, [groupMembers]);

  const people = useMemo(() => {
    const byEmail = new Map();

    invitations.forEach((invite) => {
      const email = normalizeEmail(invite.email);
      if (!email) return;
      byEmail.set(email, {
        key: `invite-${invite.id}`,
        email,
        full_name: invite.full_name,
        role: invite.role || 'viewer',
        group_ids: invite.group_ids || [],
        status: invite.status || 'pending',
        invited_at: invite.invited_at,
        accepted_at: invite.accepted_at,
        invite,
        user: null,
      });
    });

    users.forEach((profile) => {
      const email = normalizeEmail(profile.email);
      if (!email) return;
      const existing = byEmail.get(email);
      const role = profile.is_admin ? 'admin' : (profile.role || 'viewer');
      const groupIds = activeGroupIdsByUser.get(profile.id) || [];
      byEmail.set(email, {
        ...(existing || {}),
        key: `user-${profile.id}`,
        email,
        full_name: profile.full_name || existing?.full_name,
        role,
        group_ids: groupIds,
        status: profile.is_active ? 'active' : 'inactive',
        domain: profile.domain,
        created_at: profile.created_at,
        invite: existing?.invite || null,
        user: profile,
      });
    });

    return Array.from(byEmail.values()).sort((a, b) => {
      const weight = { pending: 0, active: 1, inactive: 2, accepted: 3, cancelled: 4 };
      return (weight[a.status] ?? 5) - (weight[b.status] ?? 5)
        || (a.full_name || a.email).localeCompare(b.full_name || b.email);
    });
  }, [activeGroupIdsByUser, invitations, users]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const [usersResult, groupsResult, invitesResult, membersResult] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('groups').select('id, name').order('name'),
        supabase.from('user_invitations').select('*').order('invited_at', { ascending: false }),
        supabase.from('group_members').select('group_id, user_id'),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (groupsResult.error) throw groupsResult.error;
      if (invitesResult.error && invitesResult.error.code !== '42P01') throw invitesResult.error;
      if (membersResult.error) throw membersResult.error;

      setUsers(usersResult.data || []);
      setGroups(groupsResult.data || []);
      setInvitations(invitesResult.error ? [] : (invitesResult.data || []));
      setGroupMembers(membersResult.data || []);
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

  const updateInvitation = async (invite, payload) => {
    const { error } = await supabase
      .from('user_invitations')
      .update(payload)
      .eq('id', invite.id);
    if (error) throw error;
  };

  const syncActiveUserGroups = async (profile, nextGroupIds) => {
    const currentGroupIds = new Set(activeGroupIdsByUser.get(profile.id) || []);
    const nextGroupIdSet = new Set(nextGroupIds);
    const groupsToRemove = [...currentGroupIds].filter((groupId) => !nextGroupIdSet.has(groupId));
    const groupsToAdd = nextGroupIds.filter((groupId) => !currentGroupIds.has(groupId));

    if (groupsToRemove.length > 0) {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('user_id', profile.id)
        .in('group_id', groupsToRemove);
      if (error) throw error;
    }

    if (groupsToAdd.length > 0) {
      const { error } = await supabase.from('group_members').insert(groupsToAdd.map((groupId) => ({
        group_id: groupId,
        user_id: profile.id,
        role: 'member',
      })));
      if (error) throw error;
    }
  };

  const handlePersonRoleChange = async (person, nextRole) => {
    if (person.user?.id === currentUser.id && person.user?.is_admin && nextRole !== 'admin') {
      toast({
        variant: 'destructive',
        title: 'Acao bloqueada',
        description: 'Voce nao pode remover seu proprio acesso de administrador.'
      });
      return;
    }

    if (!isAdmin && (person.role === 'admin' || nextRole === 'admin')) {
      toast({
        variant: 'destructive',
        title: 'Acao restrita ao Admin',
        description: 'Gestores podem criar e organizar usuarios, mas nao podem alterar administradores.'
      });
      return;
    }

    setUpdatingRole(prev => ({ ...prev, [person.key]: true }));

    try {
      if (person.user) {
        const payload = {
          role: nextRole,
          is_admin: nextRole === 'admin'
        };
        const { error } = await supabase.from('profiles').update(payload).eq('id', person.user.id);
        if (error) throw error;
        await logAction('update_user_role', 'user', person.user.id, { role: nextRole });
      } else if (person.invite) {
        await updateInvitation(person.invite, { role: nextRole });
        await logAction('update_invite_role', 'user_invitation', person.invite.id, { role: nextRole, email: person.email });
      }

      await fetchUsers();
      toast({
        title: 'Perfil atualizado',
        description: `${person.email} agora e ${roleLabel(nextRole, nextRole === 'admin')}.`
      });
    } catch (err) {
      console.error('Error updating role:', err);
      toast({ variant: 'destructive', title: 'Erro ao atualizar perfil', description: err.message });
    } finally {
      setUpdatingRole(prev => ({ ...prev, [person.key]: false }));
    }
  };

  const handlePersonGroupToggle = async (person, groupId) => {
    const currentGroups = person.group_ids || [];
    const nextGroupIds = currentGroups.includes(groupId)
      ? currentGroups.filter((id) => id !== groupId)
      : [...currentGroups, groupId];

    setUpdatingGroups(prev => ({ ...prev, [person.key]: true }));

    try {
      if (person.user) {
        await syncActiveUserGroups(person.user, nextGroupIds);
        await logAction('update_user_groups', 'user', person.user.id, { groups: nextGroupIds.length });
      } else if (person.invite) {
        await updateInvitation(person.invite, { group_ids: nextGroupIds });
        await logAction('update_invite_groups', 'user_invitation', person.invite.id, { groups: nextGroupIds.length, email: person.email });
      }

      await fetchUsers();
      toast({ title: 'Grupos atualizados', description: `Acesso de ${person.email} atualizado.` });
    } catch (err) {
      console.error('Error updating groups:', err);
      toast({ variant: 'destructive', title: 'Erro ao atualizar grupos', description: err.message });
    } finally {
      setUpdatingGroups(prev => ({ ...prev, [person.key]: false }));
    }
  };

  const handleToggleActive = async (person) => {
    if (!person.user) return;
    if (person.user.id === currentUser.id) {
      toast({ variant: 'destructive', title: 'Acao bloqueada', description: 'Voce nao pode desativar sua propria conta.' });
      return;
    }

    if (!isAdmin && person.role === 'admin') {
      toast({ variant: 'destructive', title: 'Acao restrita ao Admin', description: 'Gestores nao podem desativar administradores.' });
      return;
    }

    const newStatus = !person.user.is_active;
    setTogglingActive(prev => ({ ...prev, [person.key]: true }));

    try {
      const { error } = await supabase.from('profiles').update({ is_active: newStatus }).eq('id', person.user.id);
      if (error) throw error;

      await logAction('toggle_active', 'user', person.user.id, { new_status: newStatus });
      await fetchUsers();

      toast({ title: 'Status atualizado', description: `O usuario ${person.email} foi ${newStatus ? 'ativado' : 'desativado'}.` });
    } catch (err) {
      console.error('Error toggling active:', err);
      toast({ variant: 'destructive', title: 'Erro ao atualizar', description: err.message });
    } finally {
      setTogglingActive(prev => ({ ...prev, [person.key]: false }));
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
                Convites e usuarios ativos ficam na mesma lista. Antes da pessoa aceitar, o perfil e os grupos ficam salvos no convite. Depois do login com Google, esses dados passam para o usuario ativo.
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
            <h2 className="font-semibold text-gray-900">Pessoas e acessos</h2>
            <p className="mt-1 text-sm text-gray-500">Seu perfil atual: {roleLabel(currentRole, currentRole === 'admin')}. Edite perfil e grupos na mesma linha.</p>
          </div>
          {loading ? (
            <LoadingSpinner size="lg" text="Carregando pessoas..." className="py-12" />
          ) : people.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-500">Nenhuma pessoa encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700">Pessoa</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Perfil de acesso</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Grupos</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {people.map((person) => {
                    const meta = statusMeta[person.status] || statusMeta.pending;
                    const isProtectedAdmin = !isAdmin && person.role === 'admin';
                    const canEditPerson = !isProtectedAdmin && (isAdmin || person.role !== 'admin');
                    const selectedGroupNames = (person.group_ids || []).map((id) => groupNameById.get(id)).filter(Boolean);

                    return (
                      <tr key={person.key} className="hover:bg-gray-50 transition-colors align-top">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{person.full_name || 'Sem nome'}</div>
                          <div className="text-gray-500">{person.email}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {person.user?.id === currentUser.id && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Voce</span>}
                            {person.domain && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{person.domain}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={person.role}
                            onChange={(event) => handlePersonRoleChange(person, event.target.value)}
                            disabled={updatingRole[person.key] || !canEditPerson}
                            className="w-full min-w-40 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                          >
                            {(isProtectedAdmin ? roleOptions : availableRoleOptions).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </td>
                        <td className="px-6 py-4 min-w-80">
                          <details className="group">
                            <summary className="flex cursor-pointer list-none items-center gap-2 text-gray-700">
                              <UsersIcon className="h-4 w-4 text-gray-400" />
                              <span>{selectedGroupNames.length ? selectedGroupNames.join(', ') : 'Nenhum grupo'}</span>
                              {updatingGroups[person.key] && <span className="text-xs text-blue-600">salvando...</span>}
                            </summary>
                            <div className="mt-3 max-h-44 overflow-auto rounded-md border border-gray-200 bg-white p-2 shadow-sm">
                              {groups.length === 0 ? (
                                <p className="px-2 py-2 text-xs text-gray-500">Nenhum grupo criado.</p>
                              ) : groups.map((group) => (
                                <label key={group.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                                  <input
                                    type="checkbox"
                                    checked={(person.group_ids || []).includes(group.id)}
                                    disabled={updatingGroups[person.key] || !canEditPerson}
                                    onChange={() => handlePersonGroupToggle(person, group.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                                  />
                                  <span>{group.name}</span>
                                </label>
                              ))}
                            </div>
                          </details>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                          {person.user && (
                            <label className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                              <input
                                type="checkbox"
                                checked={person.user.is_active || false}
                                onChange={() => handleToggleActive(person)}
                                disabled={togglingActive[person.key] || !canEditPerson || person.user.id === currentUser.id}
                                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-50"
                              />
                              Usuario ativo
                            </label>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {person.invite?.status === 'pending' ? (
                            <Button variant="outline" size="sm" onClick={() => cancelInvitation(person.invite)}>Cancelar convite</Button>
                          ) : (
                            <span className="text-xs text-gray-400">{person.created_at ? new Date(person.created_at).toLocaleDateString() : '-'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
