import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth.jsx';

export const useSecrets = () => {
  const { user } = useAuth();
  const [secrets, setSecrets] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSecrets = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, is_admin, is_active')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      const { data: groupMembers, error: groupError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id);

      if (groupError) throw groupError;

      const groupIds = (groupMembers || []).map(g => g.group_id);

      const { data: secretsData, error: secretsError } = await supabase
        .from('secrets')
        .select('id, owner_id, title, login, link, notes, tags, expires_at, is_personal, created_at, updated_at, deleted_at, owner:profiles(email)')
        .order('updated_at', { ascending: false });

      if (secretsError) throw secretsError;

      if (!secretsData || secretsData.length === 0) {
        setSecrets([]);
        return;
      }

      let permissionsQuery = supabase
        .from('secret_permissions')
        .select('*')
        .in('secret_id', secretsData.map(s => s.id))
        .is('revoked_at', null);

      if (groupIds.length > 0) {
        permissionsQuery = permissionsQuery.or(`granted_to_user_id.eq.${user.id},granted_to_group_id.in.(${groupIds.join(',')})`);
      } else {
        permissionsQuery = permissionsQuery.eq('granted_to_user_id', user.id);
      }

      const { data: permissionsData = [], error: permissionsError } = await permissionsQuery;

      if (permissionsError) throw permissionsError;

      const processedSecrets = secretsData.map(secret => {
        let myPermission = 'none';
        let accessType = secret.is_personal ? 'personal' : 'shared';

        if (secret.owner_id === user.id) {
          myPermission = 'owner';
        } else if (profileData?.is_admin) {
          myPermission = 'admin';
        } else {
          const userPerms = permissionsData.filter(p =>
            p.secret_id === secret.id &&
            (p.granted_to_user_id === user.id || groupIds.includes(p.granted_to_group_id))
          );

          const weights = { none: 0, view: 1, edit: 2, manage_access: 3, admin: 4, owner: 5 };
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
          is_archived: Boolean(secret.deleted_at),
          access_type: accessType,
          my_permission: myPermission,
          owner_email: secret.owner?.email || 'Desconhecido'
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

  return { secrets, profile, loading, error, refresh: fetchSecrets };
};
