import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { type Session, type User } from '@supabase/supabase-js';
import type { Enums } from '@/types/supabase';
import { getSupabaseErrorMessage, supabase } from '@/lib/supabase';

type AppRole = Enums<'app_role'>;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(getSupabaseErrorMessage(error, 'No fue posible obtener el rol del usuario.'));
    }

    return (data?.role as AppRole) ?? null;
  }, []);

  const applySession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user) {
      setRole(null);
      return;
    }

    try {
      const nextRole = await fetchRole(nextSession.user.id);
      setRole(nextRole);
    } catch (error) {
      console.error(error);
      setRole(null);
    }
  }, [fetchRole]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      try {
        await applySession(nextSession);
      } finally {
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: initialSession }, error }) => {
      try {
        if (error) {
          throw error;
        }

        await applySession(initialSession);
      } catch (sessionError) {
        console.error(getSupabaseErrorMessage(sessionError, 'No fue posible restaurar la sesion.'));
        setSession(null);
        setUser(null);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [applySession]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw new Error(getSupabaseErrorMessage(error, 'No fue posible iniciar sesion.'));
    }

    if (!data.session || !data.user) {
      throw new Error('Supabase no devolvio una sesion valida.');
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      throw new Error(getSupabaseErrorMessage(error, 'No fue posible crear la cuenta.'));
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error(getSupabaseErrorMessage(error, 'No fue posible cerrar la sesion.'));
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return ctx;
}
