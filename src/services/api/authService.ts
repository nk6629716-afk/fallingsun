import { UserProfile, UserRole } from '@shared/types';
import { API_BASE_URL } from './apiClient';

export interface AuthSession {
  user: UserProfile;
  token?: string;
}

export interface SignUpPayload {
  email: string;
  password?: string;
  name: string;
  callsign?: string;
  role?: UserRole;
  teamId?: string;
  teamName?: string;
  missionId?: string;
  missionName?: string;
}

export interface AddPersonnelPayload {
  id: string;
  name: string;
  teamId?: string;
  teamName?: string;
  missionId?: string;
  missionName?: string;
  role?: UserRole;
  callsign?: string;
  isNewRegistration?: boolean;
}

export class AuthService {
  private static readonly STORAGE_USER_KEY = 'sentinel_auth_user';
  private static readonly STORAGE_TOKEN_KEY = 'sentinel_auth_token';

  public getCurrentUser(): UserProfile | null {
    try {
      const stored = localStorage.getItem(AuthService.STORAGE_USER_KEY);
      if (!stored) return null;
      return JSON.parse(stored) as UserProfile;
    } catch {
      return null;
    }
  }

  public getToken(): string | null {
    try {
      return localStorage.getItem(AuthService.STORAGE_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  public setCurrentUser(user: UserProfile, token?: string): void {
    try {
      localStorage.setItem(AuthService.STORAGE_USER_KEY, JSON.stringify(user));
      if (token) {
        localStorage.setItem(AuthService.STORAGE_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(AuthService.STORAGE_TOKEN_KEY);
      }
    } catch (err) {
      console.warn('[AuthService] Failed to cache user session:', err);
    }
  }

  public clearCurrentUser(): void {
    try {
      localStorage.removeItem(AuthService.STORAGE_USER_KEY);
      localStorage.removeItem(AuthService.STORAGE_TOKEN_KEY);
      localStorage.removeItem('sentinel_auth_session');
    } catch (err) {
      console.warn('[AuthService] Failed to clear user session:', err);
    }
  }

  public async getOptions(): Promise<{ demoEnabled: boolean }> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/options`);
      return response.ok ? await response.json() : { demoEnabled: false };
    } catch { return { demoEnabled: false }; }
  }

  public async signInDemo(): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoRole: 'administrator' }),
      });
      const result = await response.json();
      if (response.ok && result.user?.status === 'approved' && result.token) this.setCurrentUser(result.user, result.token);
      return response.ok ? result : { success: false, error: result.error || 'Demo sign in failed.' };
    } catch { return { success: false, error: 'Unable to connect to demo server.' }; }
  }

  public async signUp(payload: SignUpPayload): Promise<{ success: boolean; user?: UserProfile; error?: string; status?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `HTTP ${res.status}: Signup rejected.` };
      }
      return data;
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Network connection failed.' };
    }
  }

  public async signIn(email: string, password?: string): Promise<{ success: boolean; user?: UserProfile; token?: string; error?: string; status?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          status: data.status || (res.status === 403 ? 'pending' : undefined),
          error: data.error || `HTTP ${res.status}: Access Denied.`,
        };
      }

      if (data.user) {
        this.setCurrentUser(data.user, data.token);
      }

      return data;
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Network connection error.' };
    }
  }

  public async restoreSession(): Promise<UserProfile | null> {
    const token = this.getToken();
    if (!token) return null;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      const body = await response.json();
      if (this.getToken() !== token) return null; // Ignore a response for a session that was signed out or replaced.
      const user = body.user || body.data?.user;
      if (!response.ok || !user || user.status !== 'approved') {
        this.clearCurrentUser();
        return null;
      }
      this.setCurrentUser(user, token);
      return user;
    } catch {
      if (this.getToken() === token) this.clearCurrentUser();
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  public async signOut(): Promise<void> {
    const token = this.getToken();
    this.clearCurrentUser();
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (err) {
      console.warn('[AuthService] Logout endpoint notice:', err);
    }
  }

  public async forgotPassword(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Password reset request failed.' };
      }
      return data;
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Network request failed.' };
    }
  }

  private sessionHeaders(): Record<string, string> {
    const token = this.getToken();
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  public async getUsers(): Promise<{ success: boolean; users?: UserProfile[]; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users`, { headers: this.sessionHeaders() });
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      return await res.json();
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  public async approveUser(userId: string, assignedRole: UserRole, approvedBy: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users/${userId}/approve`, {
        method: 'PATCH',
        headers: this.sessionHeaders(),
        body: JSON.stringify({ status: 'approved', approvedBy }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
      return data;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  public async addPersonnel(payload: AddPersonnelPayload, requesterRole: string): Promise<{ success: boolean; personnel?: any; accountLinked?: boolean; linkedUserEmail?: string; error?: string; message?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/vitalwatch/personnel`, {
        method: 'POST',
        headers: {
          ...this.sessionHeaders(),
          'x-user-role': requesterRole,
        },
        body: JSON.stringify({
          ...payload,
          requesterRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `HTTP ${res.status}: Registration failed.` };
      }
      return data;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export const authService = new AuthService();
