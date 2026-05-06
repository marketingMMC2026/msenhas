import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth.jsx';

export const useAccessRequests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRequests = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch requests created by the current user
      const { data, error: fetchError } = await supabase
        .from('access_requests')
        .select(`
          *,
          secret:secrets(title)
        `)
        .eq('requested_by_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Flatten structure for easier consumption
      const formattedRequests = data.map(req => ({
        ...req,
        secret_title: req.secret?.title || 'Unknown Secret'
      }));

      setRequests(formattedRequests);
    } catch (err) {
      console.error('Error fetching access requests:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  return { requests, loading, error, refetch: fetchRequests };
};