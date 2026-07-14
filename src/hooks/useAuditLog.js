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
      const context = {
        ...details,
        page_path: window.location.pathname,
        user_agent: navigator.userAgent,
        logged_at: new Date().toISOString(),
      };

      // Via RPC SECURITY DEFINER: o servidor fixa user_id := auth.uid()
      // (o client não consegue forjar autoria — ver A2).
      const { error } = await supabase.rpc('log_audit_event', {
        p_action: action,
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_details: context,
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
