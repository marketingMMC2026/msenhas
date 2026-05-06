import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Loader2 } from 'lucide-react';
import { decryptSecretText, encryptSecretText, isSecretEncryptionConfigured } from '@/lib/secretCrypto';

const SecretModal = ({ isOpen, onClose, secret, onSuccess }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  const [loading, setLoading] = useState(false);

  // Form States
  const [title, setTitle] = useState('');
  const [login, setLogin] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [twofa, setTwofa] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isPersonal, setIsPersonal] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const hydrateSecret = async () => {
      if (!secret) {
        resetForm();
        return;
      }

      setTitle(secret.title || '');
      setLogin(secret.login || '');
      setLink(secret.link || '');
      setNotes(secret.notes || '');
      setTags(secret.tags ? secret.tags.join(', ') : '');
      setExpiresAt(secret.expires_at || '');
      setIsPersonal(secret.is_personal ?? true);

      try {
        const decryptedSecret = await decryptSecretText(secret.secret_value || '');
        const decryptedTwofa = await decryptSecretText(secret.twofa_recovery || '');
        if (!cancelled) {
          setSecretValue(decryptedSecret || '');
          setTwofa(decryptedTwofa || '');
        }
      } catch (err) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Erro ao abrir segredo",
            description: err.message,
          });
        }
      }
    };

    hydrateSecret();

    return () => {
      cancelled = true;
    };
  }, [secret, isOpen, toast]);

  const resetForm = () => {
    setTitle('');
    setLogin('');
    setSecretValue('');
    setLink('');
    setNotes('');
    setTags('');
    setTwofa('');
    setExpiresAt('');
    setIsPersonal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !secretValue.trim()) {
      toast({
         variant: "destructive",
         title: "Campos obrigatórios",
         description: "Título e Segredo são obrigatórios."
      });
      return;
    }
    
    if (!user?.id) {
        toast({ variant: "destructive", title: "Erro de sessão", description: "Sessão ainda carregando. Tente novamente." });
        return;
    }

    setLoading(true);

    try {
      const payload = {
        title: title.trim(),
        login: login.trim() || null,
        secret_value: await encryptSecretText(secretValue.trim()),
        link: link.trim() || null,
        notes: notes.trim() || null,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        twofa_recovery: twofa.trim() ? await encryptSecretText(twofa.trim()) : null,
        expires_at: expiresAt || null,
        is_personal: isPersonal,
        owner_id: user.id
      };

      let result;
      if (secret) {
        // Update
        const { data, error } = await supabase
          .from('secrets')
          .update(payload)
          .eq('id', secret.id)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
        await logAction('update_secret', 'secret', secret.id, { title: payload.title });
        toast({ title: "Sucesso", description: "Segredo atualizado com sucesso." });
      } else {
        // Create
        const { data, error } = await supabase
          .from('secrets')
          .insert(payload)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
        await logAction('create_secret', 'secret', result.id, { title: payload.title });
        toast({ title: "Sucesso", description: "Segredo criado com sucesso." });
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving secret:', {
        status: err.code,
        code: err.code,
        message: err.message
      });
      toast({ 
        variant: "destructive", 
        title: secret ? "Erro ao atualizar" : "Erro ao criar segredo", 
        description: err.message 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{secret ? 'Editar Segredo' : 'Criar Segredo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="title">Título *</Label>
                    <input id="title" required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Ex: Banco Itaú" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="login">Login (opcional)</Label>
                        <input id="login" value={login} onChange={e => setLogin(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="usuario123" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="secret">Senha/Segredo *</Label>
                        <input id="secret" type="password" required value={secretValue} onChange={e => setSecretValue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="••••••••" />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="link">URL / Link (opcional)</Label>
                    <input id="link" type="url" value={link} onChange={e => setLink(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="https://..." />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="notes">Notas (opcional)</Label>
                    <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[80px]" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
                        <input id="tags" value={tags} onChange={e => setTags(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="finanças, pessoal" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="expires">Expira em (opcional)</Label>
                        <input id="expires" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="twofa">Código de Recuperação 2FA (opcional)</Label>
                    <input id="twofa" value={twofa} onChange={e => setTwofa(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm" />
                </div>

                {!isSecretEncryptionConfigured() && (
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                    Criptografia local não configurada. Defina VITE_SECRET_ENCRYPTION_KEY para salvar novos segredos criptografados.
                  </div>
                )}

                <div className="flex items-center space-x-2 pt-2">
                     <input type="checkbox" id="personal" checked={isPersonal} onChange={e => setIsPersonal(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                     <Label htmlFor="personal">Este é um segredo pessoal (visível apenas para mim e admins)</Label>
                </div>
            </div>

            <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
                <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                     {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar'}
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SecretModal;
