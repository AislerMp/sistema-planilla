import { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUser, loginUser, logout } from "../services/auth.Service.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const result = await getCurrentUser();
        if (mounted) setUser(result.user);
      } catch {
        // Un 401 solo significa que todavía no hay una sesión iniciada.
        if (mounted) setUser(null);
      } finally {
        if (mounted) setIsCheckingSession(false);
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  async function signIn(credentials) {
    const result = await loginUser(credentials);
    setUser(result.user);
    return result;
  }

  async function signOut() {
    if (user) await logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isCheckingSession,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de AuthProvider");
  }

  return context;
}
