import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingSpinner from '@/components/LoadingSpinner';
import CreateGroupModal from '@/components/CreateGroupModal';
import GroupMembersModal from '@/components/GroupMembersModal';
import { Users, Plus, Trash2, Settings } from 'lucide-react';

const GroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const { logAction } = useAuditLog();
  const { toast } = useToast();

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Delete Confirm
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      // Joining with profiles to get creator email
      const { data, error } = await supabase
        .from('groups')
        .select('*, profiles:created_by(email)')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setGroups(data);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro ao buscar grupos", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (group) => {
    setGroupToDelete(group);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!groupToDelete) return;

    setDeletingId(groupToDelete.id);
    setDeleteConfirmOpen(false);

    try {
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupToDelete.id);

      if (error) throw error;

      await logAction('delete_group', 'group', groupToDelete.id, { name: groupToDelete.name });
      
      toast({ title: "Grupo excluído com sucesso" });
      setGroups(groups.filter(g => g.id !== groupToDelete.id));
    } catch (err) {
      toast({ variant: "destructive", title: "Falha ao excluir", description: err.message });
    } finally {
      setDeletingId(null);
      setGroupToDelete(null);
    }
  };

  const openMembersModal = (group) => {
    setSelectedGroup(group);
    setMembersModalOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>Grupos - MSENHAS</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Grupos</h1>
            <p className="text-gray-600 mt-1">Gerencie grupos de usuários e acessos.</p>
          </div>
          <Button onClick={() => setCreateModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-5 w-5 mr-2" />
            Criar Grupo
          </Button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <LoadingSpinner size="lg" text="Carregando grupos..." className="py-12" />
          ) : groups.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Nenhum grupo encontrado</h3>
              <p className="mt-1 text-gray-500">Comece criando um novo grupo.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700">Nome do Grupo</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Descrição</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Criado Por</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Última Atualização</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {groups.map((group) => (
                    <tr key={group.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-blue-100 flex items-center justify-center text-blue-700">
                          <Users className="h-4 w-4" />
                        </div>
                        {group.name}
                      </td>
                      <td className="px-6 py-4 text-gray-600 max-w-xs truncate">
                        {group.description || <span className="text-gray-400 italic">Sem descrição</span>}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {group.profiles?.email}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {new Date(group.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => openMembersModal(group)}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Gerenciar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteClick(group)}
                            disabled={deletingId === group.id}
                          >
                            {deletingId === group.id ? (
                              <LoadingSpinner size="sm" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <CreateGroupModal 
        open={createModalOpen} 
        onOpenChange={setCreateModalOpen} 
        onSuccess={fetchGroups}
      />

      <GroupMembersModal
        open={membersModalOpen}
        onOpenChange={setMembersModalOpen}
        group={selectedGroup}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Excluir Grupo "${groupToDelete?.name}"?`}
        message="Tem certeza? Esta ação não pode ser desfeita e todos os membros serão removidos deste grupo."
        confirmText="Excluir Grupo"
        isDangerous={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
};

export default GroupsPage;
