import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth.jsx';

export const useAuditLog = () => {
  const { user } = useAuth();

  const logAction = useCallback(async (action, resourceType, resourceId, details = null) => {
    if (!user) {
      console.warn('Audit log attempted without authenticated user');
      return;
    }

    try {
      const { error } = await supabase.from('audit_logs').insert({
        user_id: user.id,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details,
      });

      if (error) {
        console.error('Failed to insert audit log:', error);
      }
    } catch (err) {
      console.error('Exception logging audit action:', err);
    }
  }, [user]);

  return { logAction };
};