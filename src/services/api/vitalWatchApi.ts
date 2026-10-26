import { api, API_BASE_URL } from './apiClient';
import {
  UserProfile,
  PersonnelProfile,
  VitalSignRecord,
  VitalWatchSummary,
  UserRole,
} from '@shared/types';

const API_BASE = API_BASE_URL;

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  callsign?: string;
  role?: UserRole;
  teamId?: string;
  teamName?: string;
  missionId?: string;
  missionName?: string;
}

export interface RecordVitalsRequest {
  personnelId: string;
  personnelName?: string;
  heartRate: number;
  spo2: number;
  systolicBp: number;
  diastolicBp: number;
  temperature: number;
  respiratoryRate: number;
  recordedBy: string;
  recorderRole: string;
  notes?: string;
}

export interface UpdateLocationRequest {
  personnelId: string;
  lat: number;
  lng: number;
  accuracyMeters?: number;
  source?: 'browser_gps' | 'manual';
}

export const vitalWatchApi = {
  // --- Auth & Users ---
  async signup(payload: SignupRequest): Promise<{ success: boolean; user: UserProfile; message: string }> {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: api.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to sign up');
    return data;
  },

  async login(email: string): Promise<{ success: boolean; user: UserProfile; message?: string; status?: string }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: api.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to log in');
      (err as any).status = data.status;
      (err as any).user = data.user;
      throw err;
    }
    return data;
  },

  async getUsers(): Promise<{ success: boolean; users: UserProfile[]; pendingCount: number; approvedCount: number }> {
    const res = await fetch(`${API_BASE}/auth/users`, { headers: api.getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch users');
    return data;
  },

  async approveUser(userId: string, approvedBy: string, status: 'approved' | 'rejected'): Promise<{ success: boolean; user: UserProfile; message: string }> {
    const res = await fetch(`${API_BASE}/auth/users/${userId}/approve`, {
      method: 'PATCH',
      headers: api.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status, approvedBy }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to approve user');
    return data;
  },

  // --- VitalWatch Personnel & Vitals ---
  async getSummary(): Promise<{ success: boolean; summary: VitalWatchSummary }> {
    const res = await fetch(`${API_BASE}/vitalwatch/summary`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch VitalWatch summary');
    return data;
  },

  async getPersonnel(): Promise<{ success: boolean; personnel: PersonnelProfile[] }> {
    const res = await fetch(`${API_BASE}/vitalwatch/personnel`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch personnel');
    return data;
  },

  async updatePersonnel(payload: Partial<PersonnelProfile> & { id: string; name: string }): Promise<{ success: boolean; personnel: PersonnelProfile }> {
    const res = await fetch(`${API_BASE}/vitalwatch/personnel`, {
      method: 'POST',
      headers: api.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update personnel');
    return data;
  },

  async updateLocation(payload: UpdateLocationRequest): Promise<{ success: boolean; personnel: PersonnelProfile }> {
    const res = await fetch(`${API_BASE}/vitalwatch/location`, {
      method: 'POST',
      headers: api.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update location');
    return data;
  },

  async getVitals(personnelId?: string): Promise<{ success: boolean; vitals: VitalSignRecord[] }> {
    const url = personnelId
      ? `${API_BASE}/vitalwatch/vitals?personnelId=${encodeURIComponent(personnelId)}`
      : `${API_BASE}/vitalwatch/vitals`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch vitals');
    return data;
  },

  async recordVitals(payload: RecordVitalsRequest): Promise<{ success: boolean; record: VitalSignRecord; message: string }> {
    const res = await fetch(`${API_BASE}/vitalwatch/vitals`, {
      method: 'POST',
      headers: api.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to record vitals');
    return data;
  },
};
