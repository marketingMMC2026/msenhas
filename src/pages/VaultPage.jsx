import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useSecrets } from '@/hooks/useSecrets';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/lib/supabase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { handleSupabaseError } from '@/utils/handleSupabaseError';
import { sanitizeAuditDetails } from '@/utils/sanitizeAuditDetails';

// Components
import SecretTable from '@/components/SecretTable';
import SecretModal from '@/components/SecretModal';
import SecretViewModal from '@/components/SecretViewModal';
import ShareSecretModal from '@/components/ShareSecretModal';

const VaultPage = () => {
  const { secrets, loading, error, refresh } = useSecrets();
  const { toast } = useToast();
  const { logAction } = useAuditLog();

  // Modals State
  const [modalState, setModalState] = useState({
    type: null, // 'create', 'edit', 'view', 'share', 'delete'
    data: null
  });

  const closeModal = () => {
    setModalState({ type: null, data: null });
  };

  // Actions
  const handleCreate = () => setModalState({ type: 'create', data: null });
  
  const fetchSecretDetails = async (secret) => {
    const { data, error } = await supabase
      .from('secrets')
      .select('*, owner:profiles(email)')
      .eq('id', secret.id)
      .single();

    if (error) throw error;

    return {
      ...secret,
      ...data,
      my_permission: secret.my_permission,
      access_type: secret.access_type,
      owner_email: data.owner?.email || secret.owner_email,
    };
  };

  const handleView = async (secret) => {
    try {
      setModalState({ type: 'view', data: await fetchSecretDetails(secret) });
    } catch (err) {
      const formattedError = handleSupabaseError(err, 'Fetch Secret Details');
      toast({ title: 'Erro', description: formattedError.message, variant: 'destructive' });
    }
  };
  
  const handleEdit = async (secret) => {
    try {
      setModalState({ type: 'edit', data: await fetchSecretDetails(secret) });
    } catch (err) {
      const formattedError = handleSupabaseError(err, 'Fetch Secret Details');
      toast({ title: 'Erro', description: formattedError.message, variant: 'destructive' });
    }
  };
  
  const handleShare = (secret) => {
    setModalState({ type: 'share', data: secret });
  };

  const handleDeleteClick = (secret) => {
    setModalState({ type: 'delete', data: secret });
  };

  const confirmDelete = async () => {
    const secret = modalState.data;
    if (!secret) return;

    try {
      // Changed to soft delete by updating deleted_at timestamp
      const { error } = await supabase
        .from('secrets')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', secret.id);
      
      if (error) throw error;
      
      await logAction('delete_secret', 'secret', secret.id, sanitizeAuditDetails({ title: secret.title }));
      
      toast({ title: 'Deletado', description: 'Segredo excluído com sucesso.' });
      refresh();
      closeModal();
    } catch (err) {
      console.error('Error deleting secret:', {
          status: err.code,
          code: err.code,
          message: err.message
      });
      const formattedError = handleSupabaseError(err, 'Delete Secret');
      if (!formattedError.isAbort) {
        toast({ title: 'Erro', description: formattedError.message, variant: 'destructive' });
      }
    }
  };

  const handleSuccess = () => {
    refresh();
  };

  return (
    <>
      <Helmet>
        <title>Cofre - SecureVault</title>
        <meta name="description" content="Gerencie seus cofres e acesse dados criptografados com segurança." />
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Cofre</h1>
            <p className="text-gray-600">Gerencie e compartilhe suas credenciais com segurança.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={refresh} title="Atualizar">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus className="h-4 w-4" /> Novo Segredo
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center justify-between">
             <div className="flex items-center gap-2">
               <AlertCircle className="h-5 w-5" />
               <span>Falha ao carregar segredos: {error}</span>
             </div>
             <Button variant="ghost" size="sm" onClick={refresh} className="text-red-700 hover:bg-red-100">Tentar novamente</Button>
          </div>
        )}

        {/* Main Content */}
        <SecretTable 
           secrets={secrets} 
           loading={loading}
           onView={handleView}
           onEdit={handleEdit}
           onShare={handleShare}
           onDelete={handleDeleteClick}
        />

        {/* Create/Edit Modal */}
        <SecretModal 
          isOpen={modalState.type === 'create' || modalState.type === 'edit'}
          onClose={closeModal}
          secret={modalState.data}
          onSuccess={handleSuccess}
        />

        {/* View Modal */}
        <SecretViewModal
          isOpen={modalState.type === 'view'}
          onClose={closeModal}
          secret={modalState.data}
          onEdit={() => handleEdit(modalState.data)}
          onShare={() => handleShare(modalState.data)}
          onDelete={() => handleDeleteClick(modalState.data)}
        />

        {/* Share Modal */}
        <ShareSecretModal 
          isOpen={modalState.type === 'share'}
          onClose={closeModal}
          secret={modalState.data}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={modalState.type === 'delete'} onOpenChange={closeModal}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
              <AlertDialogDescription>
                Essa ação não pode ser desfeita. Isso excluirá permanentemente o segredo
                <strong> "{modalState.data?.title}"</strong> e removerá o acesso de todos os usuários compartilhados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                Excluir Segredo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </>
  );
};

export default VaultPage;
