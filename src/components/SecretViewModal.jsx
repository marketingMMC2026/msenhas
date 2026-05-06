import React, { useState, useRef, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Eye, EyeOff, Copy, ExternalLink, Edit2, Share2, Trash2, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { handleSupabaseError } from '@/utils/handleSupabaseError';
import { sanitizeAuditDetails } from '@/utils/sanitizeAuditDetails';
import { decryptSecretText } from '@/lib/secretCrypto';

const SecretViewModal = ({ isOpen, onClose, secret, onEdit, onShare, onDelete }) => {
  const { logAction } = useAuditLog();
  const { toast } = useToast();
  const [isRevealed, setIsRevealed] = useState(false);
  const [decryptedSecret, setDecryptedSecret] = useState('');
  const [decryptedTwofa, setDecryptedTwofa] = useState('');
  const [decryptError, setDecryptError] = useState(null);
  const timerRef = useRef(null);

  // Reset state when modal opens/changes
  useEffect(() => {
    let cancelled = false;

    if (isOpen) {
      setIsRevealed(false);
      setDecryptError(null);
      if (timerRef.current) clearTimeout(timerRef.current);

      const decryptFields = async () => {
        if (!secret) return;
        try {
          const nextSecret = await decryptSecretText(secret.secret_value || '');
          const nextTwofa = await decryptSecretText(secret.twofa_recovery || '');
          if (!cancelled) {
            setDecryptedSecret(nextSecret || '');
            setDecryptedTwofa(nextTwofa || '');
          }
        } catch (err) {
          if (!cancelled) {
            setDecryptedSecret('');
            setDecryptedTwofa('');
            setDecryptError(err.message);
          }
        }
      };

      decryptFields();
    }
    return () => {
       cancelled = true;
       if (timerRef.current) clearTimeout(timerRef.current);
    }
  }, [isOpen, secret]);

  const handleReveal = () => {
    if (isRevealed) {
      setIsRevealed(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      setIsRevealed(true);
      // Try/catch for logging action, although it's fire-and-forget usually, 
      // but strictly user requested to use handleSupabaseError for reveal_secret
      try {
        logAction('reveal_secret', 'secret', secret.id, sanitizeAuditDetails({ title: secret.title }));
      } catch (err) {
        handleSupabaseError(err, 'Log Reveal Secret');
      }
      
      // Auto-hide after 10 seconds
      timerRef.current = setTimeout(() => {
        setIsRevealed(false);
      }, 10000);
    }
  };

  const handleCopy = async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied!", description: `${label} copied to clipboard.` });
      
      logAction('copy_secret', 'secret', secret.id, sanitizeAuditDetails({ field: label }));
    } catch (err) {
      // Clipboard API error or audit log error
      const formattedError = handleSupabaseError(err, 'Copy Secret');
      toast({ title: "Error", description: formattedError.message, variant: "destructive" });
    }
  };

  if (!secret) return null;

  const canEdit = secret.my_permission === 'owner' || ['edit', 'manage_access'].includes(secret.my_permission);
  const canShare = secret.my_permission === 'owner' || secret.my_permission === 'manage_access';
  const isOwner = secret.my_permission === 'owner';
  const visibleSecret = decryptError ? '' : (decryptedSecret || secret.secret_value || '');
  const visibleTwofa = decryptError ? '' : (decryptedTwofa || secret.twofa_recovery || '');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {secret.title}
            {secret.is_personal && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-normal">Personal</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Metadata Row */}
          <div className="grid grid-cols-2 gap-4 text-sm">
             <div>
                <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Login</label>
                <div className="flex items-center gap-2 mt-1 font-mono bg-gray-50 p-2 rounded">
                   <span className="truncate">{secret.login || 'N/A'}</span>
                   {secret.login && (
                     <button onClick={() => handleCopy(secret.login, 'Login')} className="ml-auto text-gray-400 hover:text-gray-600">
                       <Copy className="h-3.5 w-3.5" />
                     </button>
                   )}
                </div>
             </div>
             <div>
                <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Website</label>
                <div className="flex items-center gap-2 mt-1 p-2">
                   {secret.link ? (
                     <a href={secret.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 truncate">
                       {secret.link} <ExternalLink className="h-3 w-3" />
                     </a>
                   ) : (
                     <span className="text-gray-400">No link</span>
                   )}
                </div>
             </div>
          </div>

          {/* Secret Value Row */}
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider flex justify-between">
              Secret Value
              {isRevealed && <span className="text-red-500 text-[10px] animate-pulse">Auto-hiding in 10s...</span>}
            </label>
            {decryptError && (
              <div className="mt-1 rounded bg-red-50 p-2 text-xs text-red-700">
                {decryptError}
              </div>
            )}
            <div className="mt-1 relative">
              <div className="w-full bg-gray-900 text-white p-3 rounded font-mono text-sm break-all pr-24 min-h-[48px] flex items-center">
                {isRevealed ? visibleSecret : '•'.repeat(32)}
              </div>
              <div className="absolute right-2 top-2 flex gap-1">
                <Button size="sm" variant="secondary" className="h-8 px-2 bg-gray-700 hover:bg-gray-600 text-white border-0" onClick={handleReveal}>
                  {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="secondary" className="h-8 px-2 bg-gray-700 hover:bg-gray-600 text-white border-0" onClick={() => handleCopy(visibleSecret, 'Secret')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* 2FA & Notes */}
          {(visibleTwofa || secret.notes) && (
            <div className="grid gap-4">
              {visibleTwofa && (
                <div>
                  <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">2FA Recovery</label>
                  <div className="mt-1 bg-gray-50 p-3 rounded font-mono text-xs whitespace-pre-wrap border border-dashed border-gray-300">
                    {isRevealed ? visibleTwofa : '•••••••• •••••••• ••••••••'}
                  </div>
                </div>
              )}
              {secret.notes && (
                <div>
                   <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Notes</label>
                   <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{secret.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Tags & Dates */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t">
            <div className="flex gap-2">
               {secret.tags && secret.tags.map(t => (
                 <span key={t} className="bg-gray-100 px-2 py-0.5 rounded-full">{t}</span>
               ))}
            </div>
            <div className="flex items-center gap-4">
              {secret.expires_at && (
                <span className="flex items-center text-orange-600" title="Expires At">
                  <Clock className="h-3 w-3 mr-1" /> {new Date(secret.expires_at).toLocaleDateString()}
                </span>
              )}
              <span>Updated: {new Date(secret.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
           {isOwner && (
              <Button variant="destructive" onClick={() => onDelete(secret)} className="mr-auto">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
           )}
           <div className="flex gap-2 w-full sm:w-auto justify-end">
             {canShare && (
                <Button variant="outline" onClick={() => onShare(secret)}>
                  <Share2 className="h-4 w-4 mr-2" /> Share
                </Button>
             )}
             {canEdit && (
                <Button variant="default" onClick={() => onEdit(secret)}>
                   <Edit2 className="h-4 w-4 mr-2" /> Edit
                </Button>
             )}
           </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SecretViewModal;
