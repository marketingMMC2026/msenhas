import { useAuth } from '@/hooks/useAuth.jsx';

export const useAdmin = () => {
  const { user, profile, loading, loadingProfile, profileLoadError, isAdmin } = useAuth();
  
  // Return consistent state derived directly from useAuth
  // This avoids double fetching and aggressive AbortControllers
  return {
    isAdmin,
    loading: loading || loadingProfile,
    error: profileLoadError,
    user,
    profile
  };
};
