import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { validateDomain } from '@/utils/validateDomain';
import { getCapabilities, getUserRole, hasCapability } from '@/lib/permissions';

const AuthContext = createContext(undefined);
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_WARNING_MS = 2 * 60 * 1000;

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
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleRemainingSeconds, setIdleRemainingSeconds] = useState(Math.floor(IDLE_WARNING_MS / 1000));

  const mounted = useRef(true);
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

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

  const clearIdleTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    warningTimerRef.current = null;
    logoutTimerRef.current = null;
    countdownTimerRef.current = null;
  }, []);

  const logSessionTimeout = useCallback(async () => {
    if (!user?.id) return;
    try {
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'session_timeout',
        resource_type: 'auth',
        resource_id: user.id,
        details: {
          reason: 'idle_timeout',
          idle_minutes: 30,
          page_path: window.location.pathname,
          user_agent: navigator.userAgent,
          logged_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.warn('[useAuth] Could not log session timeout:', err.message);
    }
  }, [user?.id]);

  const startIdleTimers = useCallback(() => {
    clearIdleTimers();
    if (!session?.user) return;

    lastActivityRef.current = Date.now();
    setShowIdleWarning(false);
    setIdleRemainingSeconds(Math.floor(IDLE_WARNING_MS / 1000));

    warningTimerRef.current = setTimeout(() => {
      setShowIdleWarning(true);
      setIdleRemainingSeconds(Math.floor(IDLE_WARNING_MS / 1000));
      countdownTimerRef.current = setInterval(() => {
        setIdleRemainingSeconds((seconds) => Math.max(0, seconds - 1));
      }, 1000);
    }, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);

    logoutTimerRef.current = setTimeout(async () => {
      clearIdleTimers();
      setShowIdleWarning(false);
      await logSessionTimeout();
      await signOut();
    }, IDLE_TIMEOUT_MS);
  }, [clearIdleTimers, logSessionTimeout, session?.user]);

  useEffect(() => {
    if (!session?.user) {
      clearIdleTimers();
      setShowIdleWarning(false);
      return undefined;
    }

    const activityEvents = ['click', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => startIdleTimers();
    const expireIdleSession = async () => {
      clearIdleTimers();
      setShowIdleWarning(false);
      await logSessionTimeout();
      await signOut();
    };
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        await expireIdleSession();
        return;
      }
      startIdleTimers();
    };

    startIdleTimers();
    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearIdleTimers();
    };
  }, [clearIdleTimers, session?.user, startIdleTimers]);

  const role = getUserRole(profile);
  const capabilities = getCapabilities(profile);
  const can = (capability) => hasCapability(profile, capability);

  const value = {
    user,
    profile,
    session,
    loading,
    loadingProfile,
    error,
    profileLoadError,
    role,
    capabilities,
    can,
    isAuthenticated: !!user,
    isAdmin: role === 'admin',
    signInWithGoogle,
    signOut,
    validateDomain,
    isAbortError
  };

  const idleMinutes = Math.ceil(idleRemainingSeconds / 60);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showIdleWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Sessao quase expirando</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Por seguranca, sua sessao sera encerrada por inatividade em cerca de {idleMinutes} minuto(s).
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Sair agora
              </button>
              <button
                type="button"
                onClick={startIdleTimers}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Continuar sessao
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
