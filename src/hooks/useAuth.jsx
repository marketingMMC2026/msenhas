import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { validateDomain } from '@/utils/validateDomain';

const AuthContext = createContext(undefined);

export const isAbortError = (error) => {
  return (
    error?.name === 'AbortError' ||
    (error instanceof DOMException &&
     error.message.includes('signal is aborted'))
  );
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [error, setError] = useState(null);
  const [profileLoadError, setProfileLoadError] = useState(null);

  const mounted = useRef(true);

  const applyPendingInvite = useCallback(async (baseProfile) => {
    try {
      const { data, error: inviteError } = await supabase.rpc('accept_pending_invite');
      if (inviteError) {
        if (inviteError.code !== '42883') {
          console.warn('[useAuth] Pending invitation was not applied:', inviteError.message);
        }
        return baseProfile;
      }

      if (data?.profile) {
        return data.profile;
      }
    } catch (err) {
      console.warn('[useAuth] Pending invitation check failed:', err.message);
    }

    return baseProfile;
  }, []);

  const fetchProfile = useCallback(async (currentUser) => {
    if (!currentUser) {
       if (mounted.current) {
         setProfile(null);
         setLoadingProfile(false);
       }
       return;
    }

    if (mounted.current) {
      setLoadingProfile(true);
      setProfileLoadError(null);
    }

    try {
      console.log('[useAuth] Fetching profile for:', currentUser.id);

      let { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (fetchError) {
        console.error('[useAuth] Profile fetch error:', {
          status: fetchError.code,
          message: fetchError.message,
          details: fetchError.details
        });

        if (mounted.current) {
          setProfileLoadError(`Erro ao carregar perfil: ${fetchError.message}`);
        }
      }

      if (existingProfile) {
        if (existingProfile.is_active === false) {
          throw new Error('Usuario desativado');
        }

        const invitedProfile = await applyPendingInvite(existingProfile);
        if (mounted.current) {
          setProfile(invitedProfile || existingProfile);
        }
      } else {
        console.log('[useAuth] No profile found for user. Creating restricted default profile.');
        try {
          const profilePayload = {
            id: currentUser.id,
            email: currentUser.email,
            full_name: currentUser.user_metadata?.full_name || currentUser.email.split('@')[0],
            domain: currentUser.email.split('@')[1] || '',
            avatar_url: currentUser.user_metadata?.avatar_url,
            is_active: true,
            is_admin: false,
            role: 'viewer'
          };

          let { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([profilePayload])
            .select()
            .single();

          if (insertError?.code === 'PGRST204' || insertError?.message?.includes("'role'")) {
            const fallbackPayload = { ...profilePayload };
            delete fallbackPayload.role;
            const fallback = await supabase
              .from('profiles')
              .insert([fallbackPayload])
              .select()
              .single();
            newProfile = fallback.data;
            insertError = fallback.error;
          }

          if (insertError) {
            console.error('[useAuth] Failed to create auto-profile:', {
              status: insertError.code,
              message: insertError.message
            });
          } else {
            const invitedProfile = await applyPendingInvite(newProfile);
            if (mounted.current) {
              setProfile(invitedProfile || newProfile);
            }
          }
        } catch (createErr) {
          console.error('[useAuth] Exception creating auto-profile:', createErr);
        }
      }

    } catch (err) {
      console.error('[useAuth] Critical profile error:', err);
      if (mounted.current) {
        const isCritical = err.message.includes('desativado');

        if (isCritical) {
          setError(err.message);
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
          setSession(null);
          return;
        }

        setProfileLoadError(err.message || 'Erro ao carregar perfil.');
      }
    } finally {
      if (mounted.current) setLoadingProfile(false);
    }
  }, [applyPendingInvite]);

  useEffect(() => {
    mounted.current = true;

    const initializeAuth = async () => {
      try {
        setLoading(true);
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[useAuth] Session error:', sessionError);
          throw sessionError;
        }

        if (mounted.current) {
          if (initialSession?.user) {
            console.log('[useAuth] Session found for:', initialSession.user.email);
            setSession(initialSession);
            setUser(initialSession.user);

            const validation = validateDomain(initialSession.user.email, import.meta.env.VITE_ALLOWED_DOMAIN);
            if (!validation.valid) {
              console.warn('[useAuth] Invalid domain:', validation.message);
              throw new Error(validation.message);
            }

            fetchProfile(initialSession.user);
          } else {
            console.log('[useAuth] No active session.');
          }
        }
      } catch (err) {
        console.error('[useAuth] Initialization critical error:', err);
        if (mounted.current) {
          setError(err.message);
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      console.log('[useAuth] Auth state change:', event);
      if (!mounted.current) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        const validation = validateDomain(currentSession.user.email, import.meta.env.VITE_ALLOWED_DOMAIN);
        if (!validation.valid) {
          setError(validation.message);
          await supabase.auth.signOut();
          return;
        }

        if (!profile || profile.id !== currentSession.user.id) {
          fetchProfile(currentSession.user);
        }
      } else {
        setProfile(null);
        setError(null);
        setProfileLoadError(null);
      }

      setLoading(false);
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error('[useAuth] Google Signin Error:', err);
      setError(err.message);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setSession(null);
      setProfile(null);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    profile,
    session,
    loading,
    loadingProfile,
    error,
    profileLoadError,
    isAuthenticated: !!user,
    isAdmin: profile?.is_admin === true || profile?.role === 'admin',
    signInWithGoogle,
    signOut,
    validateDomain,
    isAbortError
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
