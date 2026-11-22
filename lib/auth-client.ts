export type AuthState = {
  email: string | null;
  configured: boolean;
};

let cached: AuthState | null = null;
let pending: Promise<AuthState> | null = null;

export function setAuthState(state: AuthState | null) {
  cached = state;
}

export function fetchAuthState() {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch("/api/auth/me");
      cached = (await response.json()) as AuthState;
    } catch {
      cached = { email: null, configured: false };
    }
    pending = null;
    return cached;
  })();
  return pending;
}
