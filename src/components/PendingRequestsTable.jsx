import React from 'react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import { CheckCircle, XCircle } from 'lucide-react';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PendingRequestsTable = ({ requests, loading, onApprove, onDeny }) => {
  if (loading) return <div className="py-8"><LoadingSpinner message="Loading pending requests..." /></div>;

  if (!requests.length) {
     return (
       <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500">
         Nenhum pedido pendente.
       </div>
     );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-700 font-medium">
            <tr>
              <th className="px-4 py-3">Requested By</th>
              <th className="px-4 py-3">Secret Title</th>
              <th className="px-4 py-3">Permission</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Created At</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.map((req) => (
              <tr key={req.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{req.requested_by_email}</td>
                <td className="px-4 py-3 text-gray-700">{req.secret_title}</td>
                <td className="px-4 py-3">
                   <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                     {req.permission_level}
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
                <td className="px-4 py-3 text-right">
                   <div className="flex justify-end gap-2">
                     <Button size="sm" onClick={() => onApprove(req)} className="bg-green-600 hover:bg-green-700 text-white h-8">
                        <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
                     </Button>
                     <Button size="sm" variant="destructive" onClick={() => onDeny(req)} className="h-8">
                        <XCircle className="h-4 w-4 mr-1" /> Negar
                     </Button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PendingRequestsTable;