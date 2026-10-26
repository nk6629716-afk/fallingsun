import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  storageMode: 'supabase' | 'file' | 'memory';
  dataDir: string;
  enableSse: boolean;
  sseHeartbeatIntervalMs: number;
  telemetryTickIntervalMs: number;
  enableAutoTelemetry: boolean;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  geminiApiKey: string;
  geminiModel: string;
  enableDemoAuth: boolean;
  disableTestFallback: boolean;
}

function resolveStorageMode(): 'supabase' | 'file' | 'memory' {
  if (process.env.STORAGE_MODE === 'memory') return 'memory';
  if (process.env.STORAGE_MODE === 'file') return 'file';
  if (process.env.STORAGE_MODE === 'supabase') return 'supabase';
  // If Supabase credentials are provided and storage mode is not explicitly pinned to file/memory, default to supabase
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim().length > 0) {
    return 'supabase';
  }
  return 'file';
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  storageMode: resolveStorageMode(),
  dataDir: process.env.DATA_DIR || path.resolve(__dirname, '../../data'),
  enableSse: process.env.ENABLE_SSE !== 'false',
  sseHeartbeatIntervalMs: parseInt(process.env.SSE_HEARTBEAT_INTERVAL_MS || '15000', 10),
  telemetryTickIntervalMs: parseInt(process.env.TELEMETRY_TICK_INTERVAL_MS || '3000', 10),
  enableAutoTelemetry: process.env.ENABLE_AUTO_TELEMETRY !== 'false',
  supabaseUrl: process.env.SUPABASE_URL || 'https://cajrbzfsfsimxweomrlt.supabase.co',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  enableDemoAuth: process.env.ENABLE_DEMO_AUTH !== 'false',
  disableTestFallback: process.env.DISABLE_TEST_FALLBACK === 'true',
};

