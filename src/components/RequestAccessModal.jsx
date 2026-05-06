import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Loader2 } from 'lucide-react';

const RequestAccessModal = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  const [loading, setLoading] = useState(false);

  const [secretId, setSecretId] = useState('');
  const [permissionLevel, setPermissionLevel] = useState('view');
  const [reason, setReason] = useState('');

  const isValidUUID = (uuid) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!secretId.trim()) {
       toast({ variant: "destructive", title: "Erro", description: "ID do segredo é obrigatório" });
       return;
    }

    if (!isValidUUID(secretId)) {
        toast({ variant: "destructive", title: "Erro", description: "ID do segredo deve ser um UUID válido" });
        return;
    }
    
    if (!user?.id) {
        toast({ variant: "destructive", title: "Erro de sessão", description: "Sessão ainda carregando. Tente novamente." });
        return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('access_requests')
        .insert({
            secret_id: secretId,
            requested_by_id: user.id,
            permission_level: permissionLevel,
            reason: reason.trim() || null
        });

      if (error) throw error;

      await logAction('request_access', 'secret', secretId, { level: permissionLevel, reason_length: reason.trim().length });
      
      toast({ title: "Sucesso", description: "Solicitação de acesso enviada com sucesso" });
      
      // Reset
      setSecretId('');
      setPermissionLevel('view');
      setReason('');
      
      if (onSuccess) onSuccess();
      onClose();

    } catch (err) {
      console.error('Request error:', {
         status: err.code,
         code: err.code,
         message: err.message
      });
      const message = err.code === '23503'
        ? 'Segredo não encontrado. Confira o ID informado.'
        : err.message;
      toast({ 
        variant: "destructive", 
        title: "Erro ao solicitar acesso", 
        description: message 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Solicitar Acesso</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="secretId">ID do Segredo (UUID)</Label>
                <input 
                    id="secretId" 
                    required 
                    value={secretId} 
                    onChange={e => setSecretId(e.target.value)} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm" 
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="level">Nível de Acesso</Label>
                <select 
                    id="level" 
                    value={permissionLevel} 
                    onChange={e => setPermissionLevel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                >
                    <option value="view">Visualizar</option>
                    <option value="edit">Editar</option>
                </select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="reason">Motivo (opcional)</Label>
                <textarea 
                    id="reason" 
                    value={reason} 
                    onChange={e => setReason(e.target.value)} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[80px]" 
                />
            </div>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
                <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                     {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</> : 'Solicitar Acesso'}
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RequestAccessModal;
