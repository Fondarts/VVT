import React, { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { User } from 'firebase/auth';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
  driveToken: string | null;
  requestDriveAccess: () => void;
  requestDriveWriteAccess: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  signIn: () => {},
  signOut: () => {},
  driveToken: null,
  requestDriveAccess: () => {},
  requestDriveWriteAccess: () => {},
});

export const useAuthContext = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};
