import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getCoupleByUserId } from "@/lib/localDb";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

  // for no-auth mode, create a local user id persisted in localStorage
  const ensureLocalUser = () => {
    const key = "local_user_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `local-${crypto.randomUUID()}`;
      localStorage.setItem(key, id);
    }
    return id;
  };

  useEffect(() => {
    if (ALLOW_NO_AUTH) {
      // create a fake session-like object with user id only
      const id = ensureLocalUser();
      setSession({
        // @ts-ignore minimal shape
        user: { id } as unknown as User,
      } as Session);
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    loading,
    async signIn(email, password) {
      if (ALLOW_NO_AUTH) {
        // no-op in no-auth mode
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    },
    async signUp(email, password) {
      if (ALLOW_NO_AUTH) return;
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
    },
    async signOut() {
      if (ALLOW_NO_AUTH) return;
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
