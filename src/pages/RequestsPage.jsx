import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/useAuth';
import { useAccessRequests } from '@/hooks/useAccessRequests';
import { usePendingRequests } from '@/hooks/usePendingRequests';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/lib/supabase';
import { handleSupabaseError } from '@/utils/handleSupabaseError';
import { sanitizeAuditDetails } from '@/utils/sanitizeAuditDetails';

// Components
import RequestTable from '@/components/RequestTable';
import PendingRequestsTable from '@/components/PendingRequestsTable';
import RequestAccessModal from '@/components/RequestAccessModal';
import DenyRequestModal from '@/components/DenyRequestModal';
import ConfirmDialog from '@/components/ConfirmDialog';
import SecretViewModal from '@/components/SecretViewModal';

const RequestsPage = () => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  
  // Hooks for data
  const { 
    requests: myRequests, 
    loading: myLoading, 
    error: myError, 
    refetch: refetchMy 
  } = useAccessRequests();

  const {
    requests: pendingRequests,
    loading: pendingLoading,
    error: pendingError,
    refetch: refetchPending
  } = usePendingRequests();

  // Modal States
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [denyModalState, setDenyModalState] = useState({ open: false, request: null });
  const [approveDialogState, setApproveDialogState] = useState({ open: false, request: null });
  const [viewSecretState, setViewSecretState] = useState({ open: false, secretId: null });
  const [secretToView, setSecretToView] = useState(null); 

  // Actions
  const handleApproveClick = (req) => {
    setApproveDialogState({ open: true, request: req });
  };

  const handleDenyClick = (req) => {
    setDenyModalState({ open: true, request: req });
  };

  const confirmApprove = async () => {
    const req = approveDialogState.request;
    if (!req) return;
    
    try {
      const { error } = await supabase.rpc('approve_access_request', { request_id: req.id });
      if (error) throw error;
      
      await logAction('approve_request', 'access_request', req.id, sanitizeAuditDetails({
        secret_title: req.secret_title,
        requested_by: req.requested_by_email
      }));
      
      toast({ title: "Sucesso", description: "Pedido aprovado com sucesso." });
      refetchPending();
    } catch (err) {
      const formattedError = handleSupabaseError(err, 'Approve Request');
      if (!formattedError.isAbort) {
        toast({ title: "Erro", description: formattedError.message, variant: "destructive" });
      }
    } finally {
      setApproveDialogState({ open: false, request: null });
    }
  };

  const handleViewSecret = async (secretId) => {
      try {
          const { data, error } = await supabase
            .from('secrets')
            .select('*, owner:profiles(email)')
            .eq('id', secretId)
            .single();
          
          if (error) throw error;
          
          const augmentedSecret = {
              ...data,
              my_permission: 'view',
              access_type: 'shared'
          };
          
          setSecretToView(augmentedSecret);
          setViewSecretState({ open: true, secretId });
      } catch (err) {
          const formattedError = handleSupabaseError(err, 'Fetch Secret Details');
          if (!formattedError.isAbort) {
            toast({ title: "Erro", description: formattedError.message, variant: "destructive" });
          }
      }
  };

  return (
    <>
      <Helmet>
        <title>Pedidos de Acesso - MSENHAS</title>
        <meta name="description" content="Ver e gerenciar pedidos de acesso." />
      </Helmet>

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Pedidos de Acesso</h1>
            <p className="text-gray-600">Gerencie solicitações de acesso a segredos.</p>
          </div>
          <Button
            onClick={() => setIsRequestModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Solicitar Acesso
          </Button>
        </div>

        {/* Admin View vs User View */}
        {isAdmin ? (
          <Tabs defaultValue="my-requests" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
              <TabsTrigger value="my-requests">Meus Pedidos</TabsTrigger>
              <TabsTrigger value="pending">Pendentes {pendingRequests.length > 0 && `(${pendingRequests.length})`}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="my-requests" className="mt-6 space-y-4">
               {myError && (
                 <div className="text-red-600 bg-red-50 p-4 rounded flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" /> {myError}
                 </div>
               )}
               <RequestTable 
                 requests={myRequests} 
                 loading={myLoading} 
                 refetch={refetchMy} 
                 onViewSecret={handleViewSecret}
               />
            </TabsContent>
            
            <TabsContent value="pending" className="mt-6 space-y-4">
               {pendingError && (
                 <div className="text-red-600 bg-red-50 p-4 rounded flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" /> {pendingError}
                 </div>
               )}
               <PendingRequestsTable 
                 requests={pendingRequests} 
                 loading={pendingLoading} 
                 onApprove={handleApproveClick} 
                 onDeny={handleDenyClick} 
               />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
             {myError && (
                 <div className="text-red-600 bg-red-50 p-4 rounded flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" /> {myError}
                 </div>
               )}
             <RequestTable 
                requests={myRequests} 
                loading={myLoading} 
                refetch={refetchMy} 
                onViewSecret={handleViewSecret}
             />
          </div>
        )}

        {/* Modals */}
        <RequestAccessModal 
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          onSuccess={refetchMy}
        />

        <DenyRequestModal 
          isOpen={denyModalState.open}
          onClose={() => setDenyModalState({ open: false, request: null })}
          request={denyModalState.request}
          onSuccess={refetchPending}
        />

        <ConfirmDialog 
          open={approveDialogState.open}
          onOpenChange={(open) => !open && setApproveDialogState({ open: false, request: null })}
          title="Aprovar Pedido"
          message={`Aprovar pedido de ${approveDialogState.request?.requested_by_email} para "${approveDialogState.request?.secret_title}" com permissão ${approveDialogState.request?.permission_level}?`}
          confirmText="Aprovar"
          onConfirm={confirmApprove}
          onCancel={() => setApproveDialogState({ open: false, request: null })}
        />

        <SecretViewModal 
           isOpen={viewSecretState.open}
           onClose={() => { setViewSecretState({ open: false, secretId: null }); setSecretToView(null); }}
           secret={secretToView}
           onEdit={() => {}} 
           onShare={() => {}}
           onDelete={() => {}}
        />

      </div>
    </>
  );
};

export default RequestsPage;
