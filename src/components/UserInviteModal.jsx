import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Mail, Users } from 'lucide-react';

const roleOptions = [
  { value: 'viewer', label: 'Viewer', uiLabel: 'Visualizador', description: 'Entra no sistema e acessa apenas senhas liberadas por grupo.' },
  { value: 'editor', label: 'Editor', uiLabel: 'Editor', description: 'Pode criar e editar senhas permitidas.' },
  { value: 'manager', label: 'Manager', uiLabel: 'Gestor', description: 'Pode organizar acessos e gerenciar grupos operacionais.' },
  { value: 'admin', label: 'System Admin', uiLabel: 'Admin do sistema', description: 'Acesso total ao sistema.' },
];

const getAppOrigin = () => (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');

const UserInviteModal = ({ open, onOpenChange, onSuccess }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('viewer');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const selectedRole = useMemo(() => roleOptions.find((option) => option.value === role), [role]);
  const selectedGroupNames = useMemo(() => selectedGroups
    .map((groupId) => groups.find((group) => group.id === groupId)?.name)
    .filter(Boolean), [selectedGroups, groups]);

  useEffect(() => {
    const fetchGroups = async () => {
      if (!open) return;
      setLoadingGroups(true);
      const { data, error } = await supabase.from('groups').select('id, name').order('name');
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao carregar grupos', description: error.message });
      } else {
        setGroups(data || []);
      }
      setLoadingGroups(false);
    };

    fetchGroups();
  }, [open, toast]);

  const reset = () => {
    setEmail('');
    setFullName('');
    setRole('viewer');
    setSelectedGroups([]);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const toggleGroup = (groupId) => {
    setSelectedGroups((current) => current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId]);
  };

  const buildInviteUrl = (targetEmail) => `${getAppOrigin()}/login?invite=${encodeURIComponent(targetEmail)}`;

  const sendInviteEmail = async (targetEmail) => {
    const response = await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: targetEmail,
        fullName: fullName.trim(),
        roleLabel: selectedRole?.label || 'Viewer',
        groupNames: selectedGroupNames,
        inviteUrl: buildInviteUrl(targetEmail),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Could not send the invitation email.');
    }
    return data;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast({ variant: 'destructive', title: 'E-mail invalido', description: 'Informe o e-mail da pessoa convidada.' });
      return;
    }

    if (!user?.id) {
      toast({ variant: 'destructive', title: 'Sessao ainda carregando', description: 'Tente novamente em alguns segundos.' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        email: cleanEmail,
        full_name: fullName.trim() || null,
        role,
        group_ids: selectedGroups,
        invited_by: user.id,
        status: 'pending',
        accepted_at: null,
      };

      const { error } = await supabase
        .from('user_invitations')
        .upsert(payload, { onConflict: 'email' });

      if (error) throw error;

      await sendInviteEmail(cleanEmail);

      toast({
        title: 'Convite enviado',
        description: `O convite foi enviado para ${cleanEmail}.`,
      });

      onSuccess?.();
      close();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao enviar convite', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convidar usuario</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            A pessoa recebera o convite por e-mail e entrara com Google. Ao fazer login, o sistema aplica automaticamente o perfil e os grupos escolhidos aqui.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Nome</Label>
              <input
                id="invite-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Joao Silva"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">E-mail *</Label>
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="usuario@empresa.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Perfil inicial</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.uiLabel}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">{selectedRole?.description}</p>
          </div>

          <div className="space-y-2">
            <Label>Grupos liberados no primeiro acesso</Label>
            <div className="max-h-56 overflow-auto rounded-md border border-gray-200 p-2">
              {loadingGroups ? (
                <div className="flex items-center gap-2 px-2 py-3 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos...</div>
              ) : groups.length === 0 ? (
                <p className="px-2 py-3 text-sm text-gray-500">Nenhum grupo criado ainda. Crie os grupos antes de convidar pessoas.</p>
              ) : groups.map((group) => (
                <label key={group.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-gray-50">
                  <input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleGroup(group.id)} />
                  <Users className="h-4 w-4 text-gray-400" />
                  <span>{group.name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500">Sem grupo selecionado, a pessoa entra no sistema mas nao acessa senhas da equipe.</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 text-white hover:bg-blue-700">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</> : <><Mail className="mr-2 h-4 w-4" /> Salvar e enviar convite</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserInviteModal;
