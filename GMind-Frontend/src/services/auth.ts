import api, { authApi, logoutSession, waitForLogout, type LogoutResult } from './api';
import { getSessionSnapshot, saveSession as persistSession, updateSessionUser } from './session';
import type { AuthResult, UserInfo } from './session';

export type { AuthResult, UserInfo };

export interface SessionInfoDto {
  id: string; createdAt: string; lastSeenAt: string;
  userAgent: string | null; browser: string; os: string; deviceLabel: string;
  ipAddress: string | null; isCurrent: boolean;
}
export interface NotificationPreferenceDto {
  reminder3Days: boolean; reminder1Day: boolean; reminder3Hours: boolean; overdueAlert: boolean;
}
export interface PendingEmailChangeDto { pendingEmail: string; expiresAt: string }
export interface MailboxMetaDto {
  id: string; to: string; subject: string; createdAt: string;
  links: { label: string; url: string }[];
}
export interface MailboxDetailDto { meta: MailboxMetaDto & { textBody?: string | null }; html: string }

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
  async listSessions(): Promise<SessionInfoDto[]> {
    return (await api.get('/api/me/sessions')).data.data;
  },
  async revokeSession(id: string): Promise<void> {
    await api.delete(`/api/me/sessions/${id}`);
  },
  async revokeOtherSessions(): Promise<number> {
    return (await api.post('/api/me/sessions/revoke-others')).data.data.revoked;
  },
  async getNotificationPreferences(): Promise<NotificationPreferenceDto> {
    return (await api.get('/api/me/notification-preferences')).data.data;
  },
  async updateNotificationPreferences(prefs: NotificationPreferenceDto): Promise<NotificationPreferenceDto> {
    return (await api.put('/api/me/notification-preferences', prefs)).data.data;
  },
  async getPendingEmailChange(): Promise<PendingEmailChangeDto | null> {
    return (await api.get('/api/me/email-change')).data.data;
  },
  async requestEmailChange(newEmail: string, currentPassword: string): Promise<PendingEmailChangeDto> {
    return (await api.post('/api/me/email-change', { newEmail, currentPassword })).data.data;
  },
  async cancelEmailChange(): Promise<void> {
    await api.delete('/api/me/email-change');
  },
  async verifyEmailChange(token: string): Promise<{ email: string }> {
    return (await authApi.post('/api/auth/verify-email-change', { token })).data.data;
  },
  // Dev mailbox (Development only) — minimal endpoints return raw payloads, not the { data } envelope.
  async devMailbox(): Promise<MailboxMetaDto[]> {
    return (await authApi.get('/api/dev/mailbox')).data;
  },
  async devMailboxMessage(id: string): Promise<MailboxDetailDto> {
    return (await authApi.get(`/api/dev/mailbox/${id}`)).data;
  },
  saveSession(r: AuthResult) {
    persistSession(r);
  },
  currentUser(): UserInfo | null {
    return getSessionSnapshot()?.user ?? null;
  },
  isLoggedIn() { return !!getSessionSnapshot(); },
};
