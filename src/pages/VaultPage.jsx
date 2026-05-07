import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Plus, RefreshCw, AlertCircle, Upload, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useSecrets } from '@/hooks/useSecrets';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { handleSupabaseError } from '@/utils/handleSupabaseError';
import { sanitizeAuditDetails } from '@/utils/sanitizeAuditDetails';
import { useLanguage } from '@/contexts/LanguageContext';
import SecretTable from '@/components/SecretTable';
import SecretModal from '@/components/SecretModal';
import SecretViewModal from '@/components/SecretViewModal';
import ShareSecretModal from '@/components/ShareSecretModal';
import ImportSecretsModal from '@/components/ImportSecretsModal';

const VaultPage = () => {
  const { secrets, loading, error, refresh } = useSecrets();
  const { can } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  const { t } = useLanguage();
  const [showArchived, setShowArchived] = useState(false);
  const [modalState, setModalState] = useState({ type: null, data: null });

  const closeModal = () => setModalState({ type: null, data: null });
  const handleCreate = () => {
    if (!can('createSecrets')) return;
    setModalState({ type: 'create', data: null });
  };
  const handleImport = () => {
    if (!can('importSecrets')) return;
    setModalState({ type: 'import', data: null });
  };

  const fetchSecretDetails = async (secret) => {
    const { data, error } = await supabase.from('secrets').select('*, owner:profiles(email)').eq('id', secret.id).single();
    if (error) throw error;
    return { ...secret, ...data, is_archived: Boolean(data.deleted_at), my_permission: secret.my_permission, access_type: secret.access_type, owner_email: data.owner?.email || secret.owner_email };
  };

  const handleView = async (secret) => {
    try { setModalState({ type: 'view', data: await fetchSecretDetails(secret) }); }
    catch (err) { const formattedError = handleSupabaseError(err, 'Fetch Secret Details'); toast({ title: 'Erro', description: formattedError.message, variant: 'destructive' }); }
  };
  const handleEdit = async (secret) => {
    if (!can('editSecrets')) return;
    try { setModalState({ type: 'edit', data: await fetchSecretDetails(secret) }); }
    catch (err) { const formattedError = handleSupabaseError(err, 'Fetch Secret Details'); toast({ title: 'Erro', description: formattedError.message, variant: 'destructive' }); }
  };
  const handleShare = (secret) => {
    if (!can('managePermissions')) return;
    setModalState({ type: 'share', data: secret });
  };
  const handleArchiveClick = (secret) => {
    if (!can('archiveSecrets')) return;
    setModalState({ type: 'archive', data: secret });
  };

  const handleArchiveError = (err) => {
    const formattedError = handleSupabaseError(err, 'Archive Secret');
    const isPolicyError = formattedError.message?.toLowerCase().includes('row-level security');
    if (!formattedError.isAbort) {
      toast({
        title: t('deleteFailedTitle'),
        description: isPolicyError ? t('deletePolicyError') : formattedError.message,
        variant: 'destructive'
      });
    }
  };

  const confirmArchive = async () => {
    const secret = modalState.data;
    if (!secret || !can('archiveSecrets')) return;
    try {
      const { error } = await supabase.from('secrets').update({ deleted_at: new Date().toISOString() }).eq('id', secret.id);
      if (error) throw error;
      await logAction('archive_secret', 'secret', secret.id, sanitizeAuditDetails({ title: secret.title }));
      toast({ title: t('archivedSuccess'), description: t('archivedDescription') });
      refresh();
      closeModal();
    } catch (err) {
      handleArchiveError(err);
    }
  };

  const handleRestore = async (secret) => {
    if (!can('archiveSecrets')) return;
    try {
      const { error } = await supabase.from('secrets').update({ deleted_at: null }).eq('id', secret.id);
      if (error) throw error;
      await logAction('restore_secret', 'secret', secret.id, sanitizeAuditDetails({ title: secret.title }));
      toast({ title: t('restoredSuccess'), description: t('restoredDescription') });
      refresh();
    } catch (err) {
      handleArchiveError(err);
    }
  };

  const handleSuccess = () => refresh();

  return (
    <>
      <Helmet><title>{t('vault')} - M Password</title><meta name="description" content={t('vaultDescription')} /></Helmet>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{t('vaultTitle')}</h1>
            <p className="text-gray-600">{t('vaultDescription')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={refresh} title={t('refresh')}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
            {can('importSecrets') && <Button variant="outline" onClick={handleImport} className="gap-2"><Upload className="h-4 w-4" /> {t('import')}</Button>}
            {can('createSecrets') && <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2"><Plus className="h-4 w-4" /> {t('newPassword')}</Button>}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center justify-between"><div className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /><span>{t('loadPasswordsError')}: {error}</span></div><Button variant="ghost" size="sm" onClick={refresh} className="text-red-700 hover:bg-red-100">{t('retry')}</Button></div>}
        <SecretTable secrets={secrets} loading={loading} showArchived={showArchived} onShowArchivedChange={setShowArchived} onView={handleView} onEdit={handleEdit} onShare={handleShare} onArchive={handleArchiveClick} onRestore={handleRestore} />
        <SecretModal isOpen={modalState.type === 'create' || modalState.type === 'edit'} onClose={closeModal} secret={modalState.data} onSuccess={handleSuccess} />
        <SecretViewModal isOpen={modalState.type === 'view'} onClose={closeModal} secret={modalState.data} onEdit={() => handleEdit(modalState.data)} onShare={() => handleShare(modalState.data)} onArchive={() => handleArchiveClick(modalState.data)} onRestore={() => handleRestore(modalState.data)} />
        <ShareSecretModal isOpen={modalState.type === 'share'} onClose={closeModal} secret={modalState.data} />
        {can('importSecrets') && <ImportSecretsModal isOpen={modalState.type === 'import'} onClose={closeModal} onSuccess={handleSuccess} />}
        <AlertDialog open={modalState.type === 'archive'} onOpenChange={(open) => !open && closeModal()}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Archive className="h-5 w-5" />
              </div>
              <AlertDialogTitle className="text-xl">{t('archiveConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription className="text-base leading-6 text-gray-600">
                {t('archiveConfirmBody')} <strong className="font-semibold text-gray-900">{modalState.data?.title}</strong>. {t('archiveConfirmHelp')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmArchive} className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600">
                {t('archivePassword')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
};

export default VaultPage;
