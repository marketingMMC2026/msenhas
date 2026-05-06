import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Trash2, Users, User } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { handleSupabaseError } from '@/utils/handleSupabaseError';
import { sanitizeAuditDetails } from '@/utils/sanitizeAuditDetails';
import { formatPermissionLabel } from '@/utils/labels';

const permissionDescriptions = {
  view: 'Pode visualizar e copiar a senha. Não altera dados nem compartilha.',
  edit: 'Pode visualizar e editar os dados da senha. Não gerencia acessos.',
  manage_access: 'Pode visualizar, editar, compartilhar, arquivar e restaurar a senha.'
};

const ShareSecretModal = ({ isOpen, onClose, secret }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();

  const [activeTab, setActiveTab] = useState('existing');
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);

  const [targetType, setTargetType] = useState('user');
  const [availableTargets, setAvailableTargets] = useState([]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [permissionLevel, setPermissionLevel] = useState('view');

  const fetchPermissions = async () => {
    if (!secret) return;
    setLoading(true);
    try {
      const { data: perms, error } = await supabase
        .from('secret_permissions')
        .select('*')
        .eq('secret_id', secret.id)
        .is('revoked_at', null);

      if (error) throw error;

      const userIds = perms.filter(p => p.granted_to_user_id).map(p => p.granted_to_user_id);
      const groupIds = perms.filter(p => p.granted_to_group_id).map(p => p.granted_to_group_id);

      let usersMap = {};
      let groupsMap = {};

      if (userIds.length > 0) {
        const { data: users } = await supabase.from('profiles').select('id, email, full_name, avatar_url').in('id', userIds);
        users?.forEach(nextUser => usersMap[nextUser.id] = nextUser);
      }
      if (groupIds.length > 0) {
        const { data: groups } = await supabase.from('groups').select('id, name').in('id', groupIds);
        groups?.forEach(group => groupsMap[group.id] = group);
      }

      const enriched = perms.map(permission => ({
        ...permission,
        target_name: permission.granted_to_user_id
          ? (usersMap[permission.granted_to_user_id]?.full_name || usersMap[permission.granted_to_user_id]?.email || 'Usuário desconhecido')
          : (groupsMap[permission.granted_to_group_id]?.name || 'Grupo desconhecido'),
        target_avatar: permission.granted_to_user_id ? usersMap[permission.granted_to_user_id]?.avatar_url : null,
        type: permission.granted_to_user_id ? 'user' : 'group'
      }));

      setPermissions(enriched);
    } catch (err) {
      const formattedError = handleSupabaseError(err, 'Fetch Permissions');
      if (!formattedError.isAbort) {
        toast({ title: 'Erro', description: 'Falha ao carregar permissões.', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableTargets = async () => {
    if (!secret) return;
    setLoading(true);
    try {
      if (targetType === 'user') {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .eq('is_active', true)
          .neq('id', user.id);

        if (error) throw error;

        const existingUserIds = permissions.filter(p => p.type === 'user').map(p => p.granted_to_user_id);
        const filtered = profiles?.filter(profile => !existingUserIds.includes(profile.id)) || [];
        setAvailableTargets(filtered);
      } else {
        const { data: groups, error } = await supabase.from('groups').select('id, name');
        if (error) throw error;

        const existingGroupIds = permissions.filter(p => p.type === 'group').map(p => p.granted_to_group_id);
        const filtered = groups?.filter(group => !existingGroupIds.includes(group.id)) || [];
        setAvailableTargets(filtered);
      }
    } catch (err) {
      handleSupabaseError(err, 'Fetch Available Targets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && secret) {
      fetchPermissions();
      setActiveTab('existing');
    }
  }, [isOpen, secret]);

  useEffect(() => {
    if (activeTab === 'add') {
      fetchAvailableTargets();
    }
  }, [activeTab, targetType, permissions]);

  const handleGrant = async () => {
    if (!selectedTargetId) return;
    setLoading(true);
    try {
      const payload = {
        secret_id: secret.id,
        granted_by_id: user.id,
        permission_level: permissionLevel,
        granted_to_user_id: targetType === 'user' ? selectedTargetId : null,
        granted_to_group_id: targetType === 'group' ? selectedTargetId : null
      };

      const { error } = await supabase.from('secret_permissions').insert([payload]);
      if (error) throw error;

      const target = availableTargets.find(item => item.id === selectedTargetId);
      const targetName = target?.email || target?.name || 'Desconhecido';

      await logAction('grant_permission', 'secret', secret.id, sanitizeAuditDetails({
        target: targetName,
        type: targetType,
        level: permissionLevel,
        secret_title: secret.title
      }));

      toast({ title: "Sucesso", description: "Acesso concedido com sucesso." });
      setSelectedTargetId('');
      fetchPermissions();
      setActiveTab('existing');
    } catch (err) {
      const formattedError = handleSupabaseError(err, 'Grant Permission');
      if (!formattedError.isAbort) {
        toast({ title: "Erro", description: formattedError.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (permissionId) => {
    try {
      const { error } = await supabase
        .from('secret_permissions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', permissionId);

      if (error) throw error;

      await logAction('revoke_permission', 'secret', secret.id, sanitizeAuditDetails({ permission_id: permissionId, secret_title: secret.title }));
      toast({ title: "Acesso removido", description: "A permissão foi removida." });
      fetchPermissions();
    } catch (err) {
      const formattedError = handleSupabaseError(err, 'Revoke Permission');
      if (!formattedError.isAbort) {
        toast({ title: "Erro", description: formattedError.message, variant: "destructive" });
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar "{secret?.title}"</DialogTitle>
        </DialogHeader>

        {secret?.is_personal ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded text-sm mb-4">
            <p><strong>Aviso:</strong> esta senha está marcada como pessoal. Ao compartilhar, outras pessoas poderão acessá-la.</p>
          </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Acessos atuais</TabsTrigger>
            <TabsTrigger value="add">Adicionar acesso</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="mt-4 space-y-4 max-h-[400px] overflow-y-auto">
            {loading && <LoadingSpinner size="sm" />}
            {!loading && permissions.length === 0 && (
              <p className="text-center text-gray-500 py-8">Nenhuma permissão específica concedida ainda.</p>
            )}
            {permissions.map(permission => (
              <div key={permission.id} className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={permission.target_avatar} />
                    <AvatarFallback>{permission.target_name.substring(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{permission.target_name}</p>
                    <p className="text-xs text-gray-500">{permission.type === 'user' ? 'Usuário' : 'Grupo'} - {formatPermissionLabel(permission.permission_level)}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRevoke(permission.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="add" className="mt-4 space-y-4">
            <div className="flex gap-4 mb-4">
              <button
                type="button"
                onClick={() => setTargetType('user')}
                className={`flex-1 py-2 text-sm border rounded-lg flex items-center justify-center gap-2 ${targetType === 'user' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white text-gray-600'}`}
              >
                <User className="h-4 w-4" /> Usuário
              </button>
              <button
                type="button"
                onClick={() => setTargetType('group')}
                className={`flex-1 py-2 text-sm border rounded-lg flex items-center justify-center gap-2 ${targetType === 'group' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white text-gray-600'}`}
              >
                <Users className="h-4 w-4" /> Grupo
              </button>
            </div>

            <div className="space-y-3">
              <Label>Selecionar {targetType === 'user' ? 'usuário' : 'grupo'}</Label>
              <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder={targetType === 'user' ? 'Selecione um usuário...' : 'Selecione um grupo...'} />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map(target => (
                    <SelectItem key={target.id} value={target.id}>
                      {targetType === 'user' ? (target.full_name || target.email) : target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Nível de permissão</Label>
              <Select value={permissionLevel} onValueChange={setPermissionLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Visualizar</SelectItem>
                  <SelectItem value="edit">Editar</SelectItem>
                  <SelectItem value="manage_access">Gerenciar acessos</SelectItem>
                </SelectContent>
              </Select>
              <p className="rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
                {permissionDescriptions[permissionLevel]}
              </p>
            </div>

            <Button onClick={handleGrant} disabled={!selectedTargetId || loading} className="w-full mt-4">
              {loading ? 'Concedendo...' : 'Conceder acesso'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ShareSecretModal;
