import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './load-env.js';

// Load environment variables
loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️ Missing Supabase environment variables.');
  console.warn('   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  console.warn('   Falling back to file-based storage for local development.');
}

// Create Supabase client with service_role key (has full access)
// Only create client if credentials are available
export const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Check if Supabase is configured
export function isSupabaseConfigured() {
  return supabase !== null;
}

// Helper function to handle Supabase errors
export function handleSupabaseError(error) {
  console.error('Supabase error:', error);
  return {
    success: false,
    error: error.message || 'Database error',
    details: error.details || null,
    code: error.code || null
  };
}

// Helper function to check if error is due to missing configuration
export function isMissingConfigError(error) {
  return error?.message?.includes('Missing Supabase') || !isSupabaseConfigured();
}

