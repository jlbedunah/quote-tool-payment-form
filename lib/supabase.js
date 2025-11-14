import { createClient } from '@supabase/supabase-js';

// Load environment variables (side effect import)
// Only import if not on Vercel to avoid module resolution issues
// On Vercel, environment variables are provided automatically
if (!process.env.VERCEL) {
  // Use dynamic import wrapped in IIFE to handle errors gracefully
  (async () => {
    try {
      await import('./load-env.js');
    } catch (error) {
      // Silently fail - environment variables will come from process.env
      if (process.env.NODE_ENV === 'development') {
        console.warn('Could not load load-env.js:', error.message);
      }
    }
  })();
}

// Determine which environment we're in
// On Vercel: VERCEL_ENV is 'production', 'preview', or 'development'
// Locally: VERCEL_ENV might not be set, so we check NODE_ENV
const isProduction = process.env.VERCEL_ENV === 'production' || 
                     (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');

// Use environment-specific variable names as fallback
// If DEV_ prefixed variables exist for preview/dev, use those
// Otherwise, fall back to standard names (for production or when dev vars don't exist)
const supabaseUrl = isProduction 
  ? process.env.SUPABASE_URL
  : (process.env.DEV_SUPABASE_URL || process.env.SUPABASE_URL);
  
const supabaseServiceKey = isProduction
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : (process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  
const supabaseAnonKey = isProduction
  ? process.env.SUPABASE_ANON_KEY
  : (process.env.DEV_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️ Missing Supabase environment variables.');
  console.warn('   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  console.warn('   Falling back to file-based storage for local development.');
}

// Create Supabase client with service_role key (has full access, bypasses RLS)
// Only create client if credentials are available
// This is for server-side operations
export const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Create Supabase client with anon key (respects RLS)
// This is for client-side authentication
export const supabaseAuth = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
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

