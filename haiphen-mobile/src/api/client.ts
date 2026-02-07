import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://api.haiphen.io';
const TOKEN_KEY = 'haiphen_auth_token';

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

type ApiResult<T = any> = {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
};

async function request<T>(method: string, path: string, body?: any): Promise<ApiResult<T>> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => null);

    if (res.status === 401) {
      await clearToken();
      return { ok: false, error: 'Unauthorized', status: 401 };
    }

    if (!res.ok) {
      const errMsg = data?.error?.message || data?.error || 'Request failed';
      return { ok: false, error: errMsg, status: res.status };
    }

    return { ok: true, data, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error', status: 0 };
  }
}

export const apiGet = <T = any>(path: string) => request<T>('GET', path);
export const apiPost = <T = any>(path: string, body?: any) => request<T>('POST', path, body);
