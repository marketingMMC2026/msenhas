import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, Trash2, Shield, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import ConfirmDialog from '@/components/ConfirmDialog';

const GroupMembersModal = ({ open, onOpenChange, group }) => {
  const { logAction } = useAuditLog();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Add Member State
  const [isAdding, setIsAdding] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [addingLoading, setAddingLoading] = useState(false);

  // Confirm Actions State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionType, setActionType] = useState(null); // 'remove' | 'role'
  const [targetMember, setTargetMember] = useState(null);
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
      setMembers(data || []);
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
      .select('id, email')
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
          role: 'member'
        });

      if (error) throw error;

      await logAction('add_group_member', 'group', group.id, { user_id: selectedUser });
      toast({ title: "Membro adicionado" });
      setIsAdding(false);
      setSelectedUser('');
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

  const confirmAction = (type, member) => {
    setActionType(type);
    setTargetMember(member);
    setConfirmOpen(true);
  };

  const handleExecuteAction = async () => {
    if (!targetMember) return;
    
    setProcessingId(targetMember.id);
    setConfirmOpen(false); // Close dialog, show loading in list if needed

    try {
      if (actionType === 'remove') {
        const { error } = await supabase
          .from('group_members')
          .delete()
          .eq('id', targetMember.id);

        if (error) throw error;
        await logAction('remove_group_member', 'group', group.id, { member_id: targetMember.id });
        toast({ title: "Membro removido" });
      } 
      else if (actionType === 'toggle_role') {
        const newRole = targetMember.role === 'admin' ? 'member' : 'admin';
        const { error } = await supabase
          .from('group_members')
          .update({ role: newRole })
          .eq('id', targetMember.id);

        if (error) throw error;
        await logAction('update_member_role', 'group', group.id, { member_id: targetMember.id, role: newRole });
        toast({ title: "Permissao atualizada" });
      }
      
      fetchMembers();
    } catch (err) {
      toast({ variant: "destructive", title: "Acao falhou", description: err.message });
    } finally {
      setProcessingId(null);
      setTargetMember(null);
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
                <p className="text-sm text-gray-500">Gerencie membros e permissoes</p>
              </div>
              <Dialog.Close asChild>
                <button className="text-gray-400 hover:text-gray-500">
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* Add Member Section */}
              <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Adicionar membro
                </h3>
                <div className="flex gap-3">
                  <select
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                  >
                    <option value="">Selecione um usuario...</option>
                    {availableUsers
                      .filter(u => !members.find(m => m.user_id === u.id))
                      .map(user => (
                        <option key={user.id} value={user.id}>
                          {user.email}
                        </option>
                      ))
                    }
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

              {/* Members List */}
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
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${member.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
                            {member.role === 'admin' ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{member.profiles?.email}</p>
                            <p className="text-xs text-gray-500">Adicionado em: {new Date(member.added_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <select
                            className="text-xs border-none bg-transparent font-medium text-gray-600 focus:ring-0 cursor-pointer"
                            value={member.role}
                            onChange={() => confirmAction('toggle_role', member)}
                            disabled={processingId === member.id}
                          >
                            <option value="member">Membro</option>
                            <option value="admin">Admin</option>
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
        title={actionType === 'remove' ? 'Remover membro' : 'Alterar permissao'}
        message={
          actionType === 'remove' 
            ? `Tem certeza de que deseja remover ${targetMember?.profiles?.email} deste grupo?`
            : `Tem certeza de que deseja alterar a permissao de ${targetMember?.profiles?.email}?`
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
