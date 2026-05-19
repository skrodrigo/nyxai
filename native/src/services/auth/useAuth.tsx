import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from '@/components/sonner';
import { useStore } from '@/lib/globalStore';
import { type ApiUser, authApi } from '@/lib/api-client';

type PendingVerification = {
  email: string;
} | null;

type AuthState = {
  isAuthenticated: boolean;
  token?: string;
  user?: ApiUser;
  session?: { token: string; id: string };
  pendingVerification: PendingVerification;
};

type SignInProps = {
  email: string;
  password: string;
};

type SignUpProps = {
  name: string;
  email: string;
  password: string;
};

type AuthContextState = AuthState & {
  isLoading: boolean;
};

type AuthContextActions = {
  signIn: (props: SignInProps) => Promise<void>;
  signUp: (props: SignUpProps) => Promise<void>;
  verifyOtp: (code: string, emailOverride?: string) => Promise<void>;
  clearPendingVerification: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthStateContext = createContext<AuthContextState | null>(null);
const AuthActionsContext = createContext<AuthContextActions | null>(null);

export function useAuth() {
  const state = useContext(AuthStateContext);
  const actions = useContext(AuthActionsContext);

  if (!state || !actions) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const session = useMemo(() => {
    if (!state.token || !state.user?.id) return undefined;
    return {
      token: state.token,
      id: state.user.id,
    };
  }, [state.token, state.user?.id]);

  return { ...state, ...actions, session };
}

async function persistAuthenticatedState(
  token: string,
  setAuthState: (value: AuthState) => Promise<void>,
) {
  const user = await authApi.me(token);
  await AsyncStorage.setItem('session', token);
  await setAuthState({
    isAuthenticated: true,
    token,
    user,
    pendingVerification: null,
  });
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [authState, setAuthState] = useAsyncState<AuthState>({
    isAuthenticated: false,
    token: undefined,
    user: undefined,
    session: undefined,
    pendingVerification: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const storedAuthState = await AsyncStorage.getItem('authState');
        const storedToken = await AsyncStorage.getItem('session');

        if (storedAuthState) {
          const parsed = JSON.parse(storedAuthState) as AuthState;
          setAuthState(parsed);
        }

        if (storedToken) {
          try {
            await persistAuthenticatedState(storedToken, setAuthState);
          } catch {
            await AsyncStorage.removeItem('session');
            await setAuthState({
              isAuthenticated: false,
              token: undefined,
              user: undefined,
              session: undefined,
              pendingVerification: null,
            });
          }
        }
      } catch (error) {
        console.error('Error loading auth state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuthState();
  }, []);

  const actions = useMemo(
    () => ({
      signIn: async ({ email, password }: SignInProps) => {
        setIsLoading(true);
        try {
          const response = await authApi.login({ email, password });

          if (response.otpRequired) {
            await setAuthState({
              isAuthenticated: false,
              token: undefined,
              user: undefined,
              session: undefined,
              pendingVerification: { email },
            });
            toast.success('Código enviado para seu email');
            return;
          }

          if (!response.token) {
            throw new Error('Token não recebido');
          }

          await persistAuthenticatedState(response.token, setAuthState);
          toast.success('Login realizado com sucesso');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Invalid credentials');
        } finally {
          setIsLoading(false);
        }
      },
      signUp: async ({ name, email, password }: SignUpProps) => {
        setIsLoading(true);
        try {
          const response = await authApi.register({ name, email, password });

          if (response.otpRequired) {
            await setAuthState({
              isAuthenticated: false,
              token: undefined,
              user: undefined,
              session: undefined,
              pendingVerification: { email },
            });
            toast.success('Conta criada. Verifique o código enviado ao email');
            return;
          }

          toast.success('Account created successfully');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to create account');
          console.error('Signup error:', error);
        } finally {
          setIsLoading(false);
        }
      },
      verifyOtp: async (code: string, emailOverride?: string) => {
        const email = emailOverride || authState.pendingVerification?.email;
        if (!email) {
          toast.error('Nenhum email aguardando verificação');
          return;
        }

        setIsLoading(true);
        try {
          const response = await authApi.verifyOtp(email, code);
          await persistAuthenticatedState(response.token, setAuthState);
          toast.success('Email verificado com sucesso');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Código inválido');
        } finally {
          setIsLoading(false);
        }
      },
      clearPendingVerification: async () => {
        await setAuthState({
          ...authState,
          pendingVerification: null,
        });
      },
      signOut: async () => {
        try {
          await AsyncStorage.removeItem('session');
          await setAuthState({
            session: undefined,
            isAuthenticated: false,
            token: undefined,
            user: undefined,
            pendingVerification: null,
          });
          const { setChatId, setGlobalStoreMessages } = useStore.getState();
          setChatId(null);
          setGlobalStoreMessages([]);
        } catch (error) {
          console.error('Error signing out:', error);
        }
      },
    }),
    [authState, setAuthState],
  );

  const state = useMemo(
    () => ({
      ...authState,
      isLoading,
    }),
    [authState, isLoading],
  );

  return (
    <AuthStateContext.Provider value={state}>
      <AuthActionsContext.Provider value={actions}>
        {children}
      </AuthActionsContext.Provider>
    </AuthStateContext.Provider>
  );
};

const useAsyncState = <T,>(initialValue: T): [T, (value: T) => Promise<void>] => {
  const [state, setState] = useState<T>(initialValue);

  const setAsyncState = useCallback(async (value: T) => {
    setState(value);
    await AsyncStorage.setItem('authState', JSON.stringify(value));
  }, []);

  return [state, setAsyncState];
};
