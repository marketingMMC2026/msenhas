import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';

const DenyRequestModal = ({ isOpen, onClose, request, onSuccess }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [denialReason, setDenialReason] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!request) return;

    if (denialReason.length < 5) {
        toast({
            title: "Validation Error",
            description: "Reason must be at least 5 characters.",
            variant: "destructive"
        });
        return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('deny_access_request', {
        request_id: request.id,
        denial_reason: denialReason
      });

      if (error) throw error;

      toast({ title: "Success", description: "Access request denied." });
      onSuccess();
      onClose();
      setDenialReason('');
    } catch (err) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!request) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deny Access Request</DialogTitle>
          <DialogDescription>
             Are you sure you want to deny the request from <strong>{request.requested_by_email}</strong> for <strong>{request.secret_title}</strong>?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
           <div className="space-y-2">
             <Label htmlFor="denial_reason">Reason for Denial</Label>
             <textarea
                id="denial_reason"
                value={denialReason}
                onChange={(e) => setDenialReason(e.target.value)}
                className="w-full p-2 border rounded-md text-sm min-h-[80px]"
                placeholder="Explain why the request is being denied..."
                maxLength={500}
                required
             />
           </div>

           <DialogFooter>
             <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
               Cancel
             </Button>
             <Button type="submit" variant="destructive" disabled={loading}>
               {loading ? 'Processing...' : 'Deny Request'}
             </Button>
           </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DenyRequestModal;