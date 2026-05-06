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
import { Eye, EyeOff, Copy, ExternalLink, Edit2, Share2, Archive, RotateCcw, Clock, History } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { handleSupabaseError } from '@/utils/handleSupabaseError';
import { sanitizeAuditDetails } from '@/utils/sanitizeAuditDetails';
import { decryptSecretText } from '@/lib/secretCrypto';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

const actionLabelKey = {
  password_changed: 'passwordChanged',
  archive_secret: 'secretArchived',
  restore_secret: 'secretRestored',
  update_secret: 'secretUpdated',
};

const SecretViewModal = ({ isOpen, onClose, secret, onEdit, onShare, onArchive, onRestore }) => {
  const { logAction } = useAuditLog();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isRevealed, setIsRevealed] = useState(false);
  const [decryptedSecret, setDecryptedSecret] = useState('');
  const [decryptedTwofa, setDecryptedTwofa] = useState('');
  const [decryptError, setDecryptError] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [revealedHistory, setRevealedHistory] = useState({});
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    if (isOpen) {
      setIsRevealed(false);
      setDecryptError(null);
      setHistoryRows([]);
      setRevealedHistory({});
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

      const fetchHistory = async () => {
        if (!secret?.id) return;
        const { data, error } = await supabase
          .from('secret_history')
          .select('id, action, changed_fields, old_secret_value, changed_by_id, changed_at, changed_by:profiles(email, full_name)')
          .eq('secret_id', secret.id)
          .order('changed_at', { ascending: false })
          .limit(8);

        if (error) {
          if (!cancelled && error.code !== '42P01') console.warn('Could not load secret history:', error.message);
          return;
        }

        const hydrated = await Promise.all((data || []).map(async (row) => {
          let previousPassword = '';
          if (row.old_secret_value) {
            try {
              previousPassword = await decryptSecretText(row.old_secret_value);
            } catch {
              previousPassword = '';
            }
          }
          return { ...row, previousPassword };
        }));

        if (!cancelled) setHistoryRows(hydrated);
      };

      decryptFields();
      fetchHistory();
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
      try {
        logAction('reveal_secret', 'secret', secret.id, sanitizeAuditDetails({ title: secret.title }));
      } catch (err) {
        handleSupabaseError(err, 'Log Reveal Secret');
      }

      timerRef.current = setTimeout(() => {
        setIsRevealed(false);
      }, 10000);
    }
  };

  const handleCopy = async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado", description: `${label} copiado para a area de transferencia.` });
      logAction('copy_secret', 'secret', secret.id, sanitizeAuditDetails({ field: label }));
    } catch (err) {
      const formattedError = handleSupabaseError(err, 'Copy Secret');
      toast({ title: "Erro", description: formattedError.message, variant: "destructive" });
    }
  };

  if (!secret) return null;

  const canEdit = !secret.is_archived && ['owner', 'admin', 'edit', 'manage_access'].includes(secret.my_permission);
  const canShare = !secret.is_archived && ['owner', 'admin', 'manage_access'].includes(secret.my_permission);
  const canManage = ['owner', 'admin', 'manage_access'].includes(secret.my_permission);
  const visibleSecret = decryptError ? '' : (decryptedSecret || secret.secret_value || '');
  const visibleTwofa = decryptError ? '' : (decryptedTwofa || secret.twofa_recovery || '');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {secret.title}
            {secret.is_personal && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-normal">Pessoal</span>}
            {secret.is_archived && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-normal">{t('archived')}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
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
                <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Site</label>
                <div className="flex items-center gap-2 mt-1 p-2">
                   {secret.link ? (
                     <a href={secret.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 truncate">
                       {secret.link} <ExternalLink className="h-3 w-3" />
                     </a>
                   ) : (
                     <span className="text-gray-400">Sem link</span>
                   )}
                </div>
             </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider flex justify-between">
              Senha
              {isRevealed && <span className="text-red-500 text-[10px] animate-pulse">Ocultando automaticamente em 10s...</span>}
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
                <Button size="sm" variant="secondary" className="h-8 px-2 bg-gray-700 hover:bg-gray-600 text-white border-0" onClick={() => handleCopy(visibleSecret, 'Senha')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {(visibleTwofa || secret.notes) && (
            <div className="grid gap-4">
              {visibleTwofa && (
                <div>
                  <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Recuperacao 2FA</label>
                  <div className="mt-1 bg-gray-50 p-3 rounded font-mono text-xs whitespace-pre-wrap border border-dashed border-gray-300">
                    {isRevealed ? visibleTwofa : '•••••••• •••••••• ••••••••'}
                  </div>
                </div>
              )}
              {secret.notes && (
                <div>
                   <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Notas</label>
                   <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{secret.notes}</p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">
              <History className="h-4 w-4 text-gray-500" /> {t('passwordHistory')}
            </div>
            <div className="divide-y divide-gray-100">
              {historyRows.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-500">{t('noPasswordHistory')}</p>
              ) : historyRows.map(row => {
                const isHistoryRevealed = Boolean(revealedHistory[row.id]);
                return (
                  <div key={row.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{t(actionLabelKey[row.action] || 'secretUpdated')}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(row.changed_at).toLocaleString('pt-BR')} • {t('changedBy')} {row.changed_by?.full_name || row.changed_by?.email || 'Sistema'}
                        </p>
                      </div>
                      {row.changed_fields?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {row.changed_fields.map(field => <span key={field} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{field}</span>)}
                        </div>
                      )}
                    </div>
                    {row.previousPassword && (
                      <div className="mt-3 flex items-center gap-2 rounded-md bg-gray-50 p-2">
                        <span className="text-xs font-medium text-gray-500">{t('previousPassword')}</span>
                        <code className="flex-1 truncate font-mono text-xs text-gray-800">
                          {isHistoryRevealed ? row.previousPassword : '•'.repeat(20)}
                        </code>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setRevealedHistory(prev => ({ ...prev, [row.id]: !prev[row.id] }))}>
                          {isHistoryRevealed ? t('hide') : t('show')}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => handleCopy(row.previousPassword, t('previousPassword'))}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t">
            <div className="flex gap-2">
               {secret.tags && secret.tags.map(tag => (
                 <span key={tag} className="bg-gray-100 px-2 py-0.5 rounded-full">{tag}</span>
               ))}
            </div>
            <div className="flex items-center gap-4">
              {secret.expires_at && (
                <span className="flex items-center text-orange-600" title="Expira em">
                  <Clock className="h-3 w-3 mr-1" /> {new Date(secret.expires_at).toLocaleDateString()}
                </span>
              )}
              <span>Atualizado: {new Date(secret.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
           {canManage && !secret.is_archived && (
              <Button variant="outline" onClick={() => onArchive(secret)} className="mr-auto text-amber-700 border-amber-200 hover:bg-amber-50">
                <Archive className="h-4 w-4 mr-2" /> {t('archive')}
              </Button>
           )}
           {canManage && secret.is_archived && (
              <Button variant="outline" onClick={() => onRestore(secret)} className="mr-auto text-green-700 border-green-200 hover:bg-green-50">
                <RotateCcw className="h-4 w-4 mr-2" /> {t('restore')}
              </Button>
           )}
           <div className="flex gap-2 w-full sm:w-auto justify-end">
             {canShare && (
                <Button variant="outline" onClick={() => onShare(secret)}>
                  <Share2 className="h-4 w-4 mr-2" /> Compartilhar
                </Button>
             )}
             {canEdit && (
                <Button variant="default" onClick={() => onEdit(secret)}>
                   <Edit2 className="h-4 w-4 mr-2" /> Editar
                </Button>
             )}
           </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SecretViewModal;
