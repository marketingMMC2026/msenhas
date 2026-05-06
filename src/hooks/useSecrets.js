import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth.jsx';

export const useSecrets = () => {
  const { user } = useAuth();
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSecrets = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Get user's groups
      const { data: groupMembers, error: groupError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id);

      if (groupError) throw groupError;

      const groupIds = groupMembers.map(g => g.group_id);

      // 2. Fetch all secrets visible to the user (RLS will filter)
      const { data: secretsData, error: secretsError } = await supabase
        .from('secrets')
        .select('id, owner_id, title, login, link, notes, tags, expires_at, is_personal, created_at, updated_at, deleted_at, owner:profiles(email)')
        .order('updated_at', { ascending: false });

      if (secretsError) throw secretsError;

      if (!secretsData || secretsData.length === 0) {
        setSecrets([]);
        return;
      }

      // 3. Fetch permissions
      let permissionsQuery = supabase
        .from('secret_permissions')
        .select('*')
        .in('secret_id', secretsData.map(s => s.id));

      if (groupIds.length > 0) {
        permissionsQuery = permissionsQuery.or(`granted_to_user_id.eq.${user.id},granted_to_group_id.in.(${groupIds.join(',')})`);
      } else {
        permissionsQuery = permissionsQuery.eq('granted_to_user_id', user.id);
      }

      const { data: permissionsData, error: permissionsError } = await permissionsQuery;

      if (permissionsError) throw permissionsError;

      // 4. Process secrets
      const processedSecrets = secretsData.map(secret => {
        let myPermission = 'none';
        let accessType = 'shared';

        if (secret.owner_id === user.id) {
          myPermission = 'owner';
          accessType = 'personal';
        } else {
          const userPerms = permissionsData.filter(p => 
            p.secret_id === secret.id && 
            (p.granted_to_user_id === user.id || groupIds.includes(p.granted_to_group_id))
          );

          const weights = { none: 0, view: 1, edit: 2, manage_access: 3 };
          let maxWeight = 0;

          userPerms.forEach(p => {
            const weight = weights[p.permission_level] || 0;
            if (weight > maxWeight) {
              maxWeight = weight;
              myPermission = p.permission_level;
            }
          });
        }

        return {
          ...secret,
          access_type: accessType,
          my_permission: myPermission,
          owner_email: secret.owner?.email || 'Unknown'
        };
      });

      setSecrets(processedSecrets);

    } catch (err) {
      console.error('Error fetching secrets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  return { secrets, loading, error, refresh: fetchSecrets };
};
