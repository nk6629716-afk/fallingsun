/**
 * SENTINEL Frontend Authentication & Session Authority Service
 * Handles user sign-in, signup, token storage, approval verification, and session persistence.
 * Enforces single session authority with verified server state restoration.
 * Never defaults to demo administrator without explicit demo action.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, UserProfile, AuthSession, ApprovalStatus } from '@shared/types';

const STORAGE_KEY = 'sentinel_auth_session';

// Extract public frontend credentials from Vite environment
const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || 'https://cajrbzfsfsimxweomrlt.supabase.co';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || '';

let clientInstance: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey && supabaseAnonKey.trim().length > 0) {
  try {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (err) {
    console.warn('[AuthService] Failed to initialize Supabase client:', err);
  }
}

export interface SignupInput {
  email: string;
  password: string;
  confirmPassword?: string;
  badgeName: string;
  regimentNo: string;
  heightCm: number;
  weightKg: number;
  ageYears: number;
}

export type AuthListener = (session: AuthSession | null) => void;

class AuthService {
  private currentSession: AuthSession | null = null;
  private listeners: Set<AuthListener> = new Set();
  private isDemoEnabled: boolean = true;

  constructor() {
    this.restoreSession();
    this.initSupabaseListener();
  }

  private restoreSession(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.currentSession = JSON.parse(stored);
      } else {
        // Do not auto-login as admin in real authentication mode
        this.currentSession = null;
      }
    } catch {
      this.currentSession = null;
    }
  }

  private initSupabaseListener(): void {
    if (clientInstance) {
      clientInstance.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
          await this.refreshSession();
        } else if (this.currentSession && !this.currentSession.user?.isDemo) {
          this.currentSession = null;
          localStorage.removeItem(STORAGE_KEY);
          this.notify();
        }
      });
    }
  }

  public getSession(): AuthSession | null {
    return this.currentSession;
  }

  public getToken(): string | null {
    return this.currentSession?.token || null;
  }

  public getUser(): UserProfile | null {
    return this.currentSession?.user || null;
  }

  public getRole(): UserRole {
    return this.currentSession?.user?.role || 'read_only_viewer';
  }

  public getApprovalStatus(): ApprovalStatus {
    return this.currentSession?.user?.approvalStatus || 'pending';
  }

  public isAuthenticated(): boolean {
    return Boolean(this.currentSession?.token);
  }

  public isApproved(): boolean {
    return this.isAuthenticated() && this.getApprovalStatus() === 'approved';
  }

  public isPending(): boolean {
    return this.isAuthenticated() && this.getApprovalStatus() === 'pending';
  }

  public isRejected(): boolean {
    return this.isAuthenticated() && this.getApprovalStatus() === 'rejected';
  }

  public isSuspended(): boolean {
    return this.isAuthenticated() && this.getApprovalStatus() === 'suspended';
  }

  public hasRole(requiredRoles: UserRole[]): boolean {
    const role = this.getRole();
    return requiredRoles.includes(role);
  }

  public async loginWithSupabase(email: string, password: string): Promise<AuthSession> {

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'Login failed');
    }

    const session: AuthSession = json.data;
    this.setSession(session);
    return session;
  }

  public async signup(input: SignupInput): Promise<AuthSession> {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || 'Registration failed');
    }

    const session: AuthSession = {
      token: json.data.token,
      user: json.data.user,
    };

    this.setSession(session);
    return session;
  }

  public async refreshSession(): Promise<AuthSession | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.logout();
        }
        return null;
      }

      const json = await res.json();
      if (json.success && json.data?.user) {
        const updatedSession: AuthSession = {
          token,
          user: json.data.user,
        };
        this.setSession(updatedSession);
        return updatedSession;
      }
    } catch (err) {
      console.warn('[AuthService] Failed to refresh session from /api/auth/me:', err);
    }

    return this.currentSession;
  }

  public demoLogin(role: UserRole): AuthSession {
    const token =
      role === 'administrator'
        ? 'dev-admin-token'
        : role === 'operations_officer'
        ? 'dev-ops-token'
        : role === 'medical_officer'
        ? 'dev-medical-token'
        : 'dev-viewer-token';

    const user: UserProfile = {
      id: `usr-${role}-demo`,
      name: `Demo ${role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
      email: `${role.replace('_', '.')}@sentinel.mil`,
      role,
      status: 'approved',
      approvalStatus: 'approved',
      createdAt: '2026-10-25T00:00:00.000Z',
      callsign:
        role === 'administrator'
          ? 'COMMAND-1'
          : role === 'operations_officer'
          ? 'TACTICAL-OPS'
          : role === 'medical_officer'
          ? 'MEDEVAC-LEAD'
          : 'OBSERVER-SIT',
      unit: role === 'medical_officer' ? 'Forward Triage & Health Monitoring' : 'Field Operations Group',
      isDemo: true,
    };

    const session: AuthSession = {
      token,
      user,
    };

    this.setSession(session);
    return session;
  }

  public async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } catch {}

    if (clientInstance) {
      try {
        await clientInstance.auth.signOut();
      } catch {}
    }

    this.currentSession = null;
    localStorage.removeItem(STORAGE_KEY);
    this.notify();

    if (typeof window !== 'undefined') {
      window.location.hash = '#login';
    }
  }

  private setSession(session: AuthSession): void {
    this.currentSession = session;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {}
    this.notify();
  }

  public subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l(this.currentSession));
  }
}

export const authService = new AuthService();
