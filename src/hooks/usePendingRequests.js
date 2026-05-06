import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth.jsx';

export const usePendingRequests = () => {
  const { user, isAdmin } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPendingRequests = useCallback(async () => {
    if (!user || !isAdmin) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('access_requests')
        .select(`
          *,
          secret:secrets(title),
          requested_by:profiles(email)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      const formattedRequests = data.map(req => ({
        ...req,
        secret_title: req.secret?.title || 'Senha desconhecida',
        requested_by_email: req.requested_by?.email || 'Usuario desconhecido'
      }));

      setRequests(formattedRequests);
    } catch (err) {
      console.error('Error fetching pending requests:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchPendingRequests();
    } else {
      setLoading(false);
    }
  }, [fetchPendingRequests, isAdmin]);

  return { requests, loading, error, refetch: fetchPendingRequests };
};
