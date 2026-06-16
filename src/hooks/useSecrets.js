import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth.jsx';

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const fetchAllRows = async (queryBuilder, pageSize = 1000) => {
  let allRows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data = [], error } = await queryBuilder().range(from, to);
    if (error) throw error;

    allRows = [...allRows, ...data];
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
};

const buildPermissionsBySecret = (permissionsData) => {
  const permissionsBySecret = new Map();
  permissionsData.forEach((permission) => {
    const current = permissionsBySecret.get(permission.secret_id) || [];
    current.push(permission);
    permissionsBySecret.set(permission.secret_id, current);
  });
  return permissionsBySecret;
};

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
        .select('id, email, full_name, is_admin, is_active, role')
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

      const groupsData = await fetchAllRows(() => supabase
        .from('groups')
        .select('id, name')
        .order('name'));

      const groupNameById = new Map(groupsData.map((group) => [group.id, group.name]));

      const secretsData = await fetchAllRows(() => supabase
        .from('secrets')
        .select('id, owner_id, title, login, link, notes, tags, expires_at, is_personal, password_strength, created_at, updated_at, deleted_at, owner:profiles(email)')
        .order('updated_at', { ascending: false }));

      const readableSecretsData = (secretsData || []).filter((secret) => !secret.is_personal || secret.owner_id === user.id);

      let visibleSecrets = [];
      if (readableSecretsData.length > 0) {
        let permissionsData = [];
        const isAdmin = profileData?.is_admin || profileData?.role === 'admin';
        const secretIdChunks = chunkArray(readableSecretsData.map(s => s.id), 100);

        if (!isAdmin) {
          for (const secretIds of secretIdChunks) {
            let permissionsQuery = supabase
              .from('secret_permissions')
              .select('*')
              .in('secret_id', secretIds)
              .is('revoked_at', null);

            if (groupIds.length > 0) {
              permissionsQuery = permissionsQuery.or(`granted_to_user_id.eq.${user.id},granted_to_group_id.in.(${groupIds.join(',')})`);
            } else {
              permissionsQuery = permissionsQuery.eq('granted_to_user_id', user.id);
            }

            const { data: chunkPermissions = [], error: permissionsError } = await permissionsQuery;
            if (permissionsError) throw permissionsError;

            permissionsData = [...permissionsData, ...chunkPermissions];
          }
        }

        const permissionsBySecret = buildPermissionsBySecret(permissionsData);

        visibleSecrets = readableSecretsData.map(secret => {
          let myPermission = 'none';
          let accessType = secret.is_personal ? 'personal' : 'shared';
          const secretPermissions = permissionsBySecret.get(secret.id) || [];
          const groupNames = Array.from(new Set(
            secretPermissions
              .map((permission) => groupNameById.get(permission.granted_to_group_id))
              .filter(Boolean)
          )).sort();

          if (secret.owner_id === user.id) {
            myPermission = 'owner';
          } else if ((profileData?.is_admin || profileData?.role === 'admin') && !secret.is_personal) {
            myPermission = 'admin';
          } else if (!secret.is_personal) {
            const userPerms = (permissionsBySecret.get(secret.id) || []).filter(p =>
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
            is_catalog_only: false,
            access_type: accessType,
            my_permission: myPermission,
            group_names: groupNames,
            owner_email: secret.owner?.email || 'Desconhecido'
          };
        });

        if (isAdmin) {
          setSecrets(visibleSecrets);
          setLoading(false);

          Promise.all(secretIdChunks.map(async (secretIds) => {
            const { data = [], error } = await supabase
              .from('secret_permissions')
              .select('secret_id, granted_to_group_id')
              .in('secret_id', secretIds)
              .is('revoked_at', null)
              .not('granted_to_group_id', 'is', null);
            if (error) throw error;
            return data;
          }))
            .then((permissionChunks) => {
              const adminPermissionsBySecret = buildPermissionsBySecret(permissionChunks.flat());
              setSecrets((currentSecrets) => currentSecrets.map((secret) => {
                const secretPermissions = adminPermissionsBySecret.get(secret.id) || [];
                const groupNames = Array.from(new Set(
                  secretPermissions
                    .map((permission) => groupNameById.get(permission.granted_to_group_id))
                    .filter(Boolean)
                )).sort();
                return { ...secret, group_names: groupNames };
              }));
            })
            .catch((permissionsError) => {
              console.warn('Could not fetch access groups in background:', permissionsError.message);
            });
        }
      }

      let catalogSecrets = [];
      const { data: catalogData, error: catalogError } = await supabase.rpc('list_secret_catalog');
      if (!catalogError && catalogData) {
        const visibleIds = new Set(visibleSecrets.map(secret => secret.id));
        catalogSecrets = catalogData
          .filter(secret => !visibleIds.has(secret.id))
          .map(secret => ({
            ...secret,
            owner_id: null,
            notes: null,
            expires_at: null,
            created_at: null,
            deleted_at: null,
            is_archived: false,
            is_catalog_only: true,
            access_type: 'catalog',
            my_permission: 'catalog',
            group_names: [],
            owner_email: secret.owner_email || 'Desconhecido'
          }));
      } else if (catalogError && catalogError.code !== '42883') {
        console.warn('Could not fetch limited secret catalog:', catalogError.message);
      }

      if (!(profileData?.is_admin || profileData?.role === 'admin')) {
        setSecrets([...visibleSecrets, ...catalogSecrets].filter((secret) => secret.my_permission !== 'none'));
      }

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
