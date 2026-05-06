import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, Trash2, Shield, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import ConfirmDialog from '@/components/ConfirmDialog';

const normalizeMemberRole = (role) => role === 'admin' ? 'manager' : (role || 'member');
const roleLabel = (role) => normalizeMemberRole(role) === 'manager' ? 'Gestor do grupo' : 'Membro';

const GroupMembersModal = ({ open, onOpenChange, group }) => {
  const { logAction } = useAuditLog();
  const { toast } = useToast();
  const { user } = useAuth();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');
  const [addingLoading, setAddingLoading] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionType, setActionType] = useState(null);
  const [targetMember, setTargetMember] = useState(null);
  const [nextRole, setNextRole] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    if (open && group) {
      fetchMembers();
      fetchAvailableUsers();
    }
  }, [open, group]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('group_members')
        .select('*, profiles:user_id(email, full_name)')
        .eq('group_id', group.id)
        .order('added_at', { ascending: false });

      if (error) throw error;
      setMembers((data || []).map(member => ({ ...member, role: normalizeMemberRole(member.role) })));
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro ao buscar membros" });
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('is_active', true)
      .order('email');
    setAvailableUsers(data || []);
  };

  const handleAddMember = async () => {
    if (!selectedUser) return;

    if (!user?.id) {
      toast({ variant: "destructive", title: "Erro de sessão", description: "Sessão ainda carregando. Tente novamente." });
      return;
    }

    try {
      setAddingLoading(true);
      const { error } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: selectedUser,
          role: selectedRole
        });

      if (error) throw error;

      await logAction('add_group_member', 'group', group.id, { user_id: selectedUser, role: selectedRole });
      toast({ title: "Membro adicionado" });
      setSelectedUser('');
      setSelectedRole('member');
      fetchMembers();
    } catch (err) {
      console.error('Error adding member:', {
        status: err.code,
        code: err.code,
        message: err.message
      });
      toast({ variant: "destructive", title: "Erro ao adicionar membro", description: err.message });
    } finally {
      setAddingLoading(false);
    }
  };

  const confirmAction = (type, member, role = null) => {
    setActionType(type);
    setTargetMember(member);
    setNextRole(role);
    setConfirmOpen(true);
  };

  const handleExecuteAction = async () => {
    if (!targetMember) return;

    setProcessingId(targetMember.id);
    setConfirmOpen(false);

    try {
      if (actionType === 'remove') {
        const { error } = await supabase
          .from('group_members')
          .delete()
          .eq('id', targetMember.id);

        if (error) throw error;
        await logAction('remove_group_member', 'group', group.id, { member_id: targetMember.id });
        toast({ title: "Membro removido" });
      } else if (actionType === 'role') {
        const { error } = await supabase
          .from('group_members')
          .update({ role: nextRole })
          .eq('id', targetMember.id);

        if (error) throw error;
        await logAction('update_member_role', 'group', group.id, { member_id: targetMember.id, role: nextRole });
        toast({ title: "Permissão atualizada" });
      }

      fetchMembers();
    } catch (err) {
      toast({ variant: "destructive", title: "Ação falhou", description: err.message });
    } finally {
      setProcessingId(null);
      setTargetMember(null);
      setNextRole(null);
    }
  };

  if (!group) return null;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-50 w-full max-w-2xl bg-white rounded-lg shadow-xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <Dialog.Title className="text-xl font-bold text-gray-900">{group.name}</Dialog.Title>
                <p className="text-sm text-gray-500">Gerencie membros e papéis dentro do grupo.</p>
              </div>
              <Dialog.Close asChild>
                <button className="text-gray-400 hover:text-gray-500">
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Adicionar membro
                </h3>
                <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
                  <select
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                  >
                    <option value="">Selecione um usuário...</option>
                    {availableUsers
                      .filter(availableUser => !members.find(member => member.user_id === availableUser.id))
                      .map(availableUser => (
                        <option key={availableUser.id} value={availableUser.id}>
                          {availableUser.full_name || availableUser.email}
                        </option>
                      ))
                    }
                  </select>
                  <select
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                  >
                    <option value="member">Membro</option>
                    <option value="manager">Gestor do grupo</option>
                  </select>
                  <Button
                    onClick={handleAddMember}
                    disabled={!selectedUser || addingLoading}
                    className="bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
                  >
                    {addingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Membros atuais ({members.length})</h3>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Nenhum membro ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${member.role === 'manager' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
                            {member.role === 'manager' ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{member.profiles?.full_name || member.profiles?.email}</p>
                            <p className="text-xs text-gray-500">{member.profiles?.email} • Adicionado em {new Date(member.added_at).toLocaleDateString()}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:ring-2 focus:ring-blue-500"
                            value={member.role}
                            onChange={(event) => confirmAction('role', member, event.target.value)}
                            disabled={processingId === member.id}
                          >
                            <option value="member">Membro</option>
                            <option value="manager">Gestor do grupo</option>
                          </select>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => confirmAction('remove', member)}
                            disabled={processingId === member.id}
                          >
                            {processingId === member.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={actionType === 'remove' ? 'Remover membro' : 'Alterar papel no grupo'}
        message={
          actionType === 'remove'
            ? `Tem certeza de que deseja remover ${targetMember?.profiles?.email} deste grupo?`
            : `Alterar ${targetMember?.profiles?.email} para ${roleLabel(nextRole)}?`
        }
        confirmText={actionType === 'remove' ? 'Remover' : 'Atualizar'}
        isDangerous={actionType === 'remove'}
        onConfirm={handleExecuteAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
};

export default GroupMembersModal;
