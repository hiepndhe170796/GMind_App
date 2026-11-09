import api, { authApi, logoutSession, waitForLogout, type LogoutResult } from './api';
import { getSessionSnapshot, saveSession as persistSession, updateSessionUser } from './session';
import type { AuthResult, UserInfo } from './session';

export type { AuthResult, UserInfo };

export const authService = {
  async register(displayName: string, email: string, password: string, confirmPassword: string) {
    const res = await authApi.post('/api/auth/register', { displayName, email, password, confirmPassword });
    return res.data.data as UserInfo;
  },
  async login(email: string, password: string): Promise<AuthResult> {
    await waitForLogout();
    await authApi.get('/api/health/ready');
    const res = await authApi.post('/api/auth/login', { email, password });
    return res.data.data;
  },
  async forgotPassword(email: string): Promise<void> {
    await authApi.post('/api/auth/forgot-password', { email });
  },
  async resetPassword(token: string, newPassword: string, confirmPassword: string): Promise<void> {
    await authApi.post('/api/auth/reset-password', { token, newPassword, confirmPassword });
  },
  async validateSession(): Promise<UserInfo> {
    const id = getSessionSnapshot()?.id;
    const res = await api.get('/api/me');
    const user = res.data.data as UserInfo;
    if (id) updateSessionUser(user, id);
    return user;
  },
  logout(): Promise<LogoutResult> {
    return logoutSession();
  },
  async updateProfile(displayName: string, avatarUrl: string | null): Promise<UserInfo> {
    const id = getSessionSnapshot()?.id;
    const res = await api.patch('/api/me', { displayName, avatarUrl });
    const user = res.data.data as UserInfo;
    if (id) updateSessionUser(user, id);
    return user;
  },
  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    await api.patch('/api/me/password', { currentPassword, newPassword, confirmPassword });
  },
  saveSession(r: AuthResult) {
    persistSession(r);
  },
  currentUser(): UserInfo | null {
    return getSessionSnapshot()?.user ?? null;
  },
  isLoggedIn() { return !!getSessionSnapshot(); },
};
