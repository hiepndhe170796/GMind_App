import api from './api';

export interface UserInfo { id: string; displayName: string; email: string; avatarUrl?: string }
export interface AuthResult { accessToken: string; refreshToken: string; expiresAt: string; user: UserInfo }

export const authService = {
  async register(displayName: string, email: string, password: string, confirmPassword: string) {
    const res = await api.post('/api/auth/register', { displayName, email, password, confirmPassword });
    return res.data.data as UserInfo;
  },
  async login(email: string, password: string): Promise<AuthResult> {
    const res = await api.post('/api/auth/login', { email, password });
    return res.data.data;
  },
  async logout() {
    try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
    localStorage.clear();
  },
  saveSession(r: AuthResult) {
    localStorage.setItem('accessToken', r.accessToken);
    localStorage.setItem('refreshToken', r.refreshToken);
    localStorage.setItem('user', JSON.stringify(r.user));
  },
  currentUser(): UserInfo | null {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  },
  isLoggedIn() { return !!localStorage.getItem('accessToken'); },
};
