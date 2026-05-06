import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Eye, EyeOff, HelpCircle, Loader2, ShieldCheck } from 'lucide-react';
import { decryptSecretText, encryptSecretText, isSecretEncryptionConfigured } from '@/lib/secretCrypto';

const fieldHelp = {
  title: 'Nome que identifica este acesso. Exemplo: Instagram - Cliente MMC, Meta Business ou Hostinger.',
  login: 'Usuário, e-mail ou identificador usado para entrar. Exemplo: marketing@meumarketingcontabil.com.',
  secret: 'Senha, token, chave API ou outro segredo sensível. Esse conteúdo deve ficar protegido e acessível só a quem precisa.',
  link: 'Endereço para acessar a ferramenta. Você pode digitar apenas o domínio, como insta.com.br; o sistema salva como https://insta.com.br.',
  notes: 'Informações úteis para operação. Exemplo: cliente relacionado, instruções de login, observações sobre plano ou responsável.',
  tags: 'Tags ajudam a classificar e encontrar senhas. Exemplo: marketing, cliente-mmc, email-principal, 2fa.',
  expires: 'Use quando a senha, token ou acesso tiver validade. Exemplo: certificado, token temporário ou licença com vencimento.',
  twofa: 'Guarde códigos de recuperação 2FA ou instruções de autenticação. Restrinja esse campo a acessos realmente confiáveis.',
  personal: 'Quando marcado, o segredo fica pessoal: visível para você e administradores. Desmarque para acessos de equipe/agência.'
};

const FieldLabel = ({ htmlFor, children, help }) => (
  <div className="flex items-center gap-1.5">
    <Label htmlFor={htmlFor}>{children}</Label>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-gray-400 hover:text-gray-600" aria-label={`Ajuda sobre ${children}`}>
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs leading-relaxed">
        {help}
      </TooltipContent>
    </Tooltip>
  </div>
);

const normalizeUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const SecretModal = ({ isOpen, onClose, secret, onSuccess }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

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
      setShowSecret(false);
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
         description: "Título e Senha/Segredo são obrigatórios."
      });
      return;
    }

    if (!user?.id) {
        toast({ variant: "destructive", title: "Erro de sessão", description: "Sessão ainda carregando. Tente novamente." });
        return;
    }

    setLoading(true);

    try {
      const normalizedLink = normalizeUrl(link);
      const payload = {
        title: title.trim(),
        login: login.trim() || null,
        secret_value: await encryptSecretText(secretValue.trim()),
        link: normalizedLink || null,
        notes: notes.trim() || null,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        twofa_recovery: twofa.trim() ? await encryptSecretText(twofa.trim()) : null,
        expires_at: expiresAt || null,
        is_personal: isPersonal
      };

      if (secret) {
        const { error } = await supabase
          .from('secrets')
          .update(payload)
          .eq('id', secret.id)
          .select()
          .single();

        if (error) throw error;
        await logAction('update_secret', 'secret', secret.id, { title: payload.title });
        toast({ title: "Sucesso", description: "Segredo atualizado com sucesso." });
      } else {
        const { data, error } = await supabase
          .from('secrets')
          .insert({ ...payload, owner_id: user.id })
          .select()
          .single();

        if (error) throw error;
        await logAction('create_secret', 'secret', data.id, { title: payload.title });
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
    <TooltipProvider delayDuration={150}>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{secret ? 'Editar Segredo' : 'Criar Segredo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2" noValidate>
              <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                      <FieldLabel htmlFor="title" help={fieldHelp.title}>Título *</FieldLabel>
                      <input id="title" required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Ex: Instagram - Cliente MMC" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <FieldLabel htmlFor="login" help={fieldHelp.login}>Login (opcional)</FieldLabel>
                          <input id="login" value={login} onChange={e => setLogin(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="marketing@meumarketingcontabil.com" />
                      </div>
                      <div className="space-y-2">
                          <FieldLabel htmlFor="secret" help={fieldHelp.secret}>Senha/Segredo *</FieldLabel>
                          <div className="relative">
                            <input id="secret" type={showSecret ? 'text' : 'password'} required value={secretValue} onChange={e => setSecretValue(e.target.value)} className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md" placeholder="••••••••" />
                            <button
                              type="button"
                              onClick={() => setShowSecret(value => !value)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              aria-label={showSecret ? 'Ocultar senha' : 'Mostrar senha'}
                            >
                              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                      </div>
                  </div>

                  <div className="space-y-2">
                      <FieldLabel htmlFor="link" help={fieldHelp.link}>URL / Link (opcional)</FieldLabel>
                      <input
                        id="link"
                        type="text"
                        inputMode="url"
                        value={link}
                        onChange={e => setLink(e.target.value)}
                        onBlur={() => setLink(value => normalizeUrl(value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="https://insta.com.br"
                      />
                  </div>

                  <div className="space-y-2">
                      <FieldLabel htmlFor="notes" help={fieldHelp.notes}>Notas (opcional)</FieldLabel>
                      <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[80px]" placeholder="Ex: acesso usado pela equipe de social media do Cliente MMC." />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <FieldLabel htmlFor="tags" help={fieldHelp.tags}>Tags (separadas por vírgula)</FieldLabel>
                          <input id="tags" value={tags} onChange={e => setTags(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="marketing, cliente-mmc, email-principal" />
                      </div>
                       <div className="space-y-2">
                          <FieldLabel htmlFor="expires" help={fieldHelp.expires}>Expira em (opcional)</FieldLabel>
                          <input id="expires" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                      </div>
                  </div>

                  <div className="space-y-2">
                      <FieldLabel htmlFor="twofa" help={fieldHelp.twofa}>Código de Recuperação 2FA (opcional)</FieldLabel>
                      <input id="twofa" value={twofa} onChange={e => setTwofa(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm" placeholder="Ex: códigos de recuperação separados por espaço ou linha" />
                  </div>

                  {isSecretEncryptionConfigured() ? (
                    <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Criptografia ativa: senhas e códigos 2FA são salvos criptografados.</span>
                    </div>
                  ) : (
                    <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                      Criptografia ainda não configurada. Defina <strong>VITE_SECRET_ENCRYPTION_KEY</strong> na Vercel para salvar novos segredos criptografados.
                    </div>
                  )}

                  <div className="flex items-start space-x-2 pt-2">
                       <input type="checkbox" id="personal" checked={isPersonal} onChange={e => setIsPersonal(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                       <div className="space-y-1">
                        <FieldLabel htmlFor="personal" help={fieldHelp.personal}>Este é um segredo pessoal</FieldLabel>
                        <p className="text-xs text-gray-500">Visível apenas para você e administradores.</p>
                       </div>
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
    </TooltipProvider>
  );
};

export default SecretModal;
