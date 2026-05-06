import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Eye, EyeOff, HelpCircle, Loader2, ShieldCheck, Users } from 'lucide-react';
import { decryptSecretText, encryptSecretText, isSecretEncryptionConfigured } from '@/lib/secretCrypto';

const fieldHelp = {
  title: 'Nome que identifica este acesso. Exemplo: Instagram - Cliente MMC, Meta Business ou Hostinger.',
  login: 'Usuario, e-mail ou identificador usado para entrar. Exemplo: marketing@meumarketingcontabil.com.',
  secret: 'Senha, token, chave API ou outro segredo sensivel. Esse conteudo deve ficar protegido e acessivel so a quem precisa.',
  link: 'Endereco para acessar a ferramenta. Voce pode digitar apenas o dominio, como insta.com.br; o sistema salva como https://insta.com.br.',
  notes: 'Informacoes uteis para operacao. Exemplo: cliente relacionado, instrucoes de login, observacoes sobre plano ou responsavel.',
  tags: 'Tags ajudam a classificar e encontrar senhas. Exemplo: marketing, cliente-mmc, email-principal, 2fa.',
  expires: 'Use quando a senha, token ou acesso tiver validade. Exemplo: certificado, token temporario ou licenca com vencimento.',
  twofa: 'Guarde codigos de recuperacao 2FA ou instrucoes de autenticacao. Restrinja esse campo a acessos realmente confiaveis.',
  groups: 'Selecione os grupos que devem acessar esta senha. Exemplo: Marketing, Criacao e Design ou Financeiro.',
  permission: 'Define o que os grupos marcados podem fazer. Visualizar abre a senha; Editar permite alterar; Gerenciar acessos permite compartilhar tambem.',
  personal: 'Quando marcado, o segredo fica pessoal: visivel para voce e administradores. Ao selecionar grupos, ele vira compartilhado automaticamente.'
};

const permissionLabels = {
  view: 'Visualizar',
  edit: 'Editar',
  manage_access: 'Gerenciar acessos'
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
  const [loadingGroups, setLoadingGroups] = useState(false);
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
  const [availableGroups, setAvailableGroups] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [groupPermissionLevel, setGroupPermissionLevel] = useState('view');

  useEffect(() => {
    let cancelled = false;

    const fetchGroups = async () => {
      if (!isOpen || !user?.id) return;
      setLoadingGroups(true);
      const { data, error } = await supabase.from('groups').select('id, name').order('name');
      if (!cancelled) {
        if (error) {
          toast({ variant: 'destructive', title: 'Erro ao carregar grupos', description: error.message });
        } else {
          setAvailableGroups(data || []);
        }
        setLoadingGroups(false);
      }
    };

    fetchGroups();
    return () => { cancelled = true; };
  }, [isOpen, user?.id, toast]);

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
      setSelectedGroupIds([]);
      setGroupPermissionLevel('view');

      try {
        const [decryptedSecret, decryptedTwofa, permissionsResult] = await Promise.all([
          decryptSecretText(secret.secret_value || ''),
          decryptSecretText(secret.twofa_recovery || ''),
          supabase
            .from('secret_permissions')
            .select('granted_to_group_id, permission_level')
            .eq('secret_id', secret.id)
            .is('revoked_at', null)
            .not('granted_to_group_id', 'is', null)
        ]);

        if (!cancelled) {
          setSecretValue(decryptedSecret || '');
          setTwofa(decryptedTwofa || '');

          if (!permissionsResult.error) {
            const groupPermissions = permissionsResult.data || [];
            setSelectedGroupIds(groupPermissions.map((permission) => permission.granted_to_group_id));
            if (groupPermissions[0]?.permission_level) {
              setGroupPermissionLevel(groupPermissions[0].permission_level);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Erro ao abrir segredo',
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
    setSelectedGroupIds([]);
    setGroupPermissionLevel('view');
  };

  const toggleGroup = (groupId) => {
    setSelectedGroupIds((current) => {
      const next = current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId];

      if (next.length > 0) setIsPersonal(false);
      return next;
    });
  };

  const syncGroupPermissions = async (secretId) => {
    const { error: revokeError } = await supabase
      .from('secret_permissions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('secret_id', secretId)
      .is('revoked_at', null)
      .not('granted_to_group_id', 'is', null);

    if (revokeError) throw revokeError;

    if (selectedGroupIds.length === 0) return;

    const permissionPayloads = selectedGroupIds.map((groupId) => ({
      secret_id: secretId,
      granted_to_user_id: null,
      granted_to_group_id: groupId,
      permission_level: groupPermissionLevel,
      granted_by_id: user.id,
    }));

    const { error: insertError } = await supabase.from('secret_permissions').insert(permissionPayloads);
    if (insertError) throw insertError;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !secretValue.trim()) {
      toast({
         variant: 'destructive',
         title: 'Campos obrigatorios',
         description: 'Titulo e Senha/Segredo sao obrigatorios.'
      });
      return;
    }

    if (!user?.id) {
        toast({ variant: 'destructive', title: 'Erro de sessao', description: 'Sessao ainda carregando. Tente novamente.' });
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
        is_personal: selectedGroupIds.length > 0 ? false : isPersonal
      };

      let savedSecretId = secret?.id;
      if (secret) {
        const { error } = await supabase
          .from('secrets')
          .update(payload)
          .eq('id', secret.id)
          .select()
          .single();

        if (error) throw error;
        await syncGroupPermissions(secret.id);
        await logAction('update_secret', 'secret', secret.id, { title: payload.title, groups: selectedGroupIds.length });
        toast({ title: 'Sucesso', description: 'Segredo atualizado com sucesso.' });
      } else {
        const { data, error } = await supabase
          .from('secrets')
          .insert({ ...payload, owner_id: user.id })
          .select()
          .single();

        if (error) throw error;
        savedSecretId = data.id;
        await syncGroupPermissions(data.id);
        await logAction('create_secret', 'secret', data.id, { title: payload.title, groups: selectedGroupIds.length });
        toast({ title: 'Sucesso', description: 'Segredo criado com sucesso.' });
      }

      if (onSuccess) onSuccess(savedSecretId);
      onClose();
    } catch (err) {
      console.error('Error saving secret:', {
        status: err.code,
        code: err.code,
        message: err.message
      });
      toast({
        variant: 'destructive',
        title: secret ? 'Erro ao atualizar' : 'Erro ao criar segredo',
        description: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{secret ? 'Editar Segredo' : 'Criar Segredo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2" noValidate>
              <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                      <FieldLabel htmlFor="title" help={fieldHelp.title}>Titulo *</FieldLabel>
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
                          <FieldLabel htmlFor="tags" help={fieldHelp.tags}>Tags (separadas por virgula)</FieldLabel>
                          <input id="tags" value={tags} onChange={e => setTags(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="marketing, cliente-mmc, email-principal" />
                      </div>
                       <div className="space-y-2">
                          <FieldLabel htmlFor="expires" help={fieldHelp.expires}>Expira em (opcional)</FieldLabel>
                          <input id="expires" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                      </div>
                  </div>

                  <div className="space-y-2">
                      <FieldLabel htmlFor="twofa" help={fieldHelp.twofa}>Codigo de Recuperacao 2FA (opcional)</FieldLabel>
                      <input id="twofa" value={twofa} onChange={e => setTwofa(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm" placeholder="Ex: codigos de recuperacao separados por espaco ou linha" />
                  </div>

                  <div className="space-y-3 rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <FieldLabel htmlFor="group-permission" help={fieldHelp.groups}>Grupos com acesso</FieldLabel>
                        <p className="mt-1 text-xs text-gray-500">Marque um ou mais grupos para compartilhar esta senha com a equipe.</p>
                      </div>
                      <div className="w-48">
                        <FieldLabel htmlFor="group-permission" help={fieldHelp.permission}>Permissao</FieldLabel>
                        <Select value={groupPermissionLevel} onValueChange={setGroupPermissionLevel}>
                          <SelectTrigger id="group-permission" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(permissionLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="max-h-36 overflow-auto rounded-md border border-gray-100 bg-gray-50 p-2">
                      {loadingGroups ? (
                        <div className="flex items-center gap-2 px-2 py-3 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos...</div>
                      ) : availableGroups.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-gray-500">Nenhum grupo criado ainda. Crie grupos na tela Grupos ou importe uma planilha com a coluna grupo.</p>
                      ) : (
                        availableGroups.map((group) => (
                          <label key={group.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-white">
                            <input
                              type="checkbox"
                              checked={selectedGroupIds.includes(group.id)}
                              onChange={() => toggleGroup(group.id)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <Users className="h-4 w-4 text-gray-400" />
                            <span>{group.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  {isSecretEncryptionConfigured() ? (
                    <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Criptografia ativa: senhas e codigos 2FA sao salvos criptografados.</span>
                    </div>
                  ) : (
                    <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                      Criptografia ainda nao configurada. Defina <strong>VITE_SECRET_ENCRYPTION_KEY</strong> na Vercel para salvar novos segredos criptografados.
                    </div>
                  )}

                  <div className="flex items-start space-x-2 pt-2">
                       <input
                        type="checkbox"
                        id="personal"
                        checked={selectedGroupIds.length > 0 ? false : isPersonal}
                        disabled={selectedGroupIds.length > 0}
                        onChange={e => setIsPersonal(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                       <div className="space-y-1">
                        <FieldLabel htmlFor="personal" help={fieldHelp.personal}>Este e um segredo pessoal</FieldLabel>
                        <p className="text-xs text-gray-500">
                          {selectedGroupIds.length > 0
                            ? 'Desativado porque ha grupos selecionados. Esta senha sera compartilhada.'
                            : 'Visivel apenas para voce e administradores.'}
                        </p>
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
