import { UserProfile } from '../../../shared/types';
import { db } from '../db/database';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabaseClient';

function table() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Account database is unavailable.');
  return client.from('sentinel_users');
}

function profile(row: Record<string, any>): UserProfile {
  return {
    id: row.id, email: row.email, name: row.name, role: row.role, status: row.status,
    callsign: row.callsign || undefined, unit: row.unit || undefined,
    teamId: row.team_id || undefined, teamName: row.team_name || undefined,
    missionId: row.mission_id || undefined, missionName: row.mission_name || undefined,
    createdAt: row.created_at, approvedAt: row.approved_at || undefined, approvedBy: row.approved_by || undefined,
  };
}

export async function getAccountById(id: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) return db.getUserById(id);
  const { data, error } = await table().select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? profile(data) : null;
}

export async function getAccountByEmail(email: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) return db.getUserByEmail(email);
  const { data, error } = await table().select('*').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (error) throw error;
  return data ? profile(data) : null;
}

export async function listAccounts(): Promise<UserProfile[]> {
  if (!isSupabaseConfigured()) return db.getUsers();
  const { data, error } = await table().select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(profile);
}

export async function approveAccount(id: string, approvedBy: string, status: 'approved' | 'rejected'): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) return db.approveUser(id, approvedBy, status);
  const { data, error } = await table().update({
    status, approved_by: approvedBy, approved_at: new Date().toISOString(),
  }).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  return data ? db.saveUser(profile(data)) : null;
}
