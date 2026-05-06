import React from 'react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Eye, XCircle, HelpCircle } from 'lucide-react';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';

const RequestTable = ({ requests, loading, refetch, onViewSecret }) => {
  const { toast } = useToast();
  const { logAction } = useAuditLog();

  const handleCancel = async (id) => {
    try {
      const { error } = await supabase
        .from('access_requests')
        .update({ status: 'cancelled' })
        .eq('id', id);
        
      if (error) throw error;
      await logAction('cancel_request', 'access_request', id);
      toast({ title: "Pedido cancelado", description: "A solicitação foi cancelada." });
      refetch();
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const showDenialReason = (reason) => {
    toast({
      title: "Motivo da negativa",
      description: reason || "Nenhum motivo informado.",
    });
  };

  if (loading) return <div className="py-8"><LoadingSpinner message="Carregando pedidos..." /></div>;

  if (!requests.length) {
     return (
       <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500">
         Você não tem pedidos de acesso.
       </div>
     );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-700 font-medium">
            <tr>
              <th className="px-4 py-3">Segredo</th>
              <th className="px-4 py-3">Permissão</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Criado em</th>
              <th className="px-4 py-3">Revisado em</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.map((req) => (
              <tr key={req.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{req.secret_title}</td>
                <td className="px-4 py-3">
                   <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                     {req.permission_level.replace('_', ' ')}
                   </span>
                </td>
                <td className="px-4 py-3">
                   <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize
                     ${req.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                       req.status === 'approved' ? 'bg-green-100 text-green-800' : 
                       req.status === 'denied' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                     {req.status}
                   </span>
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                   <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="truncate cursor-help">{req.reason}</div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">{req.reason}</p>
                        </TooltipContent>
                      </Tooltip>
                   </TooltipProvider>
                </td>
                <td className="px-4 py-3 text-gray-500">
                   {new Date(req.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3 text-gray-500">
                   {req.reviewed_at ? new Date(req.reviewed_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                   {req.status === 'pending' && (
                     <Button variant="ghost" size="sm" onClick={() => handleCancel(req.id)} className="text-red-600 hover:text-red-700">
                        <XCircle className="h-4 w-4 mr-1" /> Cancelar
                     </Button>
                   )}
                   {req.status === 'approved' && (
                     <Button variant="ghost" size="sm" onClick={() => onViewSecret(req.secret_id)} className="text-blue-600 hover:text-blue-700">
                        <Eye className="h-4 w-4 mr-1" /> Ver Segredo
                     </Button>
                   )}
                   {req.status === 'denied' && (
                     <Button variant="ghost" size="sm" onClick={() => showDenialReason(req.denial_reason)} className="text-gray-600 hover:text-gray-700">
                        <HelpCircle className="h-4 w-4 mr-1" /> Ver Motivo
                     </Button>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RequestTable;
