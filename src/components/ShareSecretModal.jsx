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
import { Trash2, UserPlus, Users, User } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { handleSupabaseError } from '@/utils/handleSupabaseError';
import { sanitizeAuditDetails } from '@/utils/sanitizeAuditDetails';

const ShareSecretModal = ({ isOpen, onClose, secret }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  
  const [activeTab, setActiveTab] = useState('existing');
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Add Permission State
  const [targetType, setTargetType] = useState('user'); // 'user' or 'group'
  const [availableTargets, setAvailableTargets] = useState([]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [permissionLevel, setPermissionLevel] = useState('view');

  const fetchPermissions = async () => {
    if (!secret) return;
    setLoading(true);
    try {
      // Fetch permissions with user/group details
      // Since supabase-js doesn't do deep joins easily on polymorphic relations without complex setup,
      // we'll fetch raw permissions then enrich them.
      
      const { data: perms, error } = await supabase
        .from('secret_permissions')
        .select('*')
        .eq('secret_id', secret.id)
        .is('revoked_at', null);
        
      if (error) throw error;

      // Collect IDs
      const userIds = perms.filter(p => p.granted_to_user_id).map(p => p.granted_to_user_id);
      const groupIds = perms.filter(p => p.granted_to_group_id).map(p => p.granted_to_group_id);

      // Fetch Names
      let usersMap = {};
      let groupsMap = {};

      if (userIds.length > 0) {
          const { data: users } = await supabase.from('profiles').select('id, email, full_name, avatar_url').in('id', userIds);
          users?.forEach(u => usersMap[u.id] = u);
      }
      if (groupIds.length > 0) {
          const { data: groups } = await supabase.from('groups').select('id, name').in('id', groupIds);
          groups?.forEach(g => groupsMap[g.id] = g);
      }

      // Merge
      const enriched = perms.map(p => ({
        ...p,
        target_name: p.granted_to_user_id 
          ? (usersMap[p.granted_to_user_id]?.full_name || usersMap[p.granted_to_user_id]?.email || 'Unknown User')
          : (groupsMap[p.granted_to_group_id]?.name || 'Unknown Group'),
        target_avatar: p.granted_to_user_id ? usersMap[p.granted_to_user_id]?.avatar_url : null,
        type: p.granted_to_user_id ? 'user' : 'group'
      }));

      setPermissions(enriched);
    } catch (err) {
      const formattedError = handleSupabaseError(err, 'Fetch Permissions');
      if (!formattedError.isAbort) {
        toast({ title: 'Error', description: 'Failed to load permissions', variant: 'destructive' });
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
                .neq('id', user.id); // Exclude self
            
            if (error) throw error;

            // Exclude existing permissions
            const existingUserIds = permissions.filter(p => p.type === 'user').map(p => p.granted_to_user_id);
            const filtered = profiles?.filter(p => !existingUserIds.includes(p.id)) || [];
            setAvailableTargets(filtered);
        } else {
            const { data: groups, error } = await supabase.from('groups').select('id, name');
            if (error) throw error;

             // Exclude existing permissions
            const existingGroupIds = permissions.filter(p => p.type === 'group').map(p => p.granted_to_group_id);
            const filtered = groups?.filter(g => !existingGroupIds.includes(g.id)) || [];
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

       const targetName = availableTargets.find(t => t.id === selectedTargetId)?.email || 
                          availableTargets.find(t => t.id === selectedTargetId)?.name || 'Unknown';

       await logAction('grant_permission', 'secret', secret.id, sanitizeAuditDetails({ 
           target: targetName, 
           type: targetType, 
           level: permissionLevel,
           secret_title: secret.title
       }));

       toast({ title: "Success", description: "Access granted successfully." });
       setSelectedTargetId('');
       fetchPermissions();
       setActiveTab('existing');
    } catch (err) {
        const formattedError = handleSupabaseError(err, 'Grant Permission');
        if (!formattedError.isAbort) {
            toast({ title: "Error", description: formattedError.message, variant: "destructive" });
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
          toast({ title: "Revoked", description: "Permission has been revoked." });
          fetchPermissions();
      } catch (err) {
          const formattedError = handleSupabaseError(err, 'Revoke Permission');
          if (!formattedError.isAbort) {
              toast({ title: "Error", description: formattedError.message, variant: "destructive" });
          }
      }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{secret?.title}"</DialogTitle>
        </DialogHeader>

        {secret?.is_personal ? (
           <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded text-sm mb-4">
              <p><strong>Warning:</strong> This is a personal secret. Sharing it will make it accessible to others.</p>
           </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Existing Access</TabsTrigger>
            <TabsTrigger value="add">Add Access</TabsTrigger>
          </TabsList>
          
          <TabsContent value="existing" className="mt-4 space-y-4 max-h-[400px] overflow-y-auto">
             {loading && <LoadingSpinner size="sm" />}
             {!loading && permissions.length === 0 && (
                 <p className="text-center text-gray-500 py-8">No specific permissions granted yet.</p>
             )}
             {permissions.map(perm => (
                 <div key={perm.id} className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm">
                    <div className="flex items-center gap-3">
                       <Avatar className="h-8 w-8">
                          <AvatarImage src={perm.target_avatar} />
                          <AvatarFallback>{perm.target_name.substring(0,2).toUpperCase()}</AvatarFallback>
                       </Avatar>
                       <div>
                          <p className="text-sm font-medium">{perm.target_name}</p>
                          <p className="text-xs text-gray-500 capitalize">{perm.type} • {perm.permission_level}</p>
                       </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRevoke(perm.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                 </div>
             ))}
          </TabsContent>
          
          <TabsContent value="add" className="mt-4 space-y-4">
             <div className="flex gap-4 mb-4">
                 <button 
                    onClick={() => setTargetType('user')}
                    className={`flex-1 py-2 text-sm border rounded-lg flex items-center justify-center gap-2 ${targetType === 'user' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white text-gray-600'}`}
                 >
                    <User className="h-4 w-4" /> User
                 </button>
                 <button 
                    onClick={() => setTargetType('group')}
                    className={`flex-1 py-2 text-sm border rounded-lg flex items-center justify-center gap-2 ${targetType === 'group' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white text-gray-600'}`}
                 >
                    <Users className="h-4 w-4" /> Group
                 </button>
             </div>

             <div className="space-y-3">
                <Label>Select {targetType === 'user' ? 'User' : 'Group'}</Label>
                <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
                   <SelectTrigger>
                      <SelectValue placeholder={`Select ${targetType}...`} />
                   </SelectTrigger>
                   <SelectContent>
                      {availableTargets.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                             {targetType === 'user' ? (t.full_name || t.email) : t.name}
                          </SelectItem>
                      ))}
                   </SelectContent>
                </Select>
             </div>

             <div className="space-y-3">
                <Label>Permission Level</Label>
                <Select value={permissionLevel} onValueChange={setPermissionLevel}>
                   <SelectTrigger>
                      <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                      <SelectItem value="view">View (Read Only)</SelectItem>
                      <SelectItem value="edit">Edit (Update Details)</SelectItem>
                      <SelectItem value="manage_access">Manage Access (Share)</SelectItem>
                   </SelectContent>
                </Select>
             </div>

             <Button onClick={handleGrant} disabled={!selectedTargetId || loading} className="w-full mt-4">
                 {loading ? 'Granting...' : 'Grant Access'}
             </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ShareSecretModal;