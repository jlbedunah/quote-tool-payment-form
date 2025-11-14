import { supabase } from '../../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: 'Authentication service not configured' 
      });
    }

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password: password
    });

    if (authError || !authData.user) {
      console.error('Supabase auth error:', authError);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }

    // Create a fresh client with service_role key for profile query
    // This ensures we bypass RLS even if the auth client has a session
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get user profile from user_profiles table using admin client (bypasses RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, first_name, last_name, email, is_admin, is_active')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to load user profile' 
      });
    }

    // Check if user is active
    if (!profile.is_active) {
      return res.status(403).json({ 
        success: false, 
        error: 'Your account has been deactivated. Please contact an administrator.' 
      });
    }

    // Set session cookies for Supabase Auth (if using cookie-based auth)
    // For now, return tokens for client-side storage
    
    // Note: In production, you might want to set HTTP-only cookies for security
    // For now, we'll return tokens and the client will manage them
    
    return res.status(200).json({
      success: true,
      user: {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        is_admin: profile.is_admin,
        is_active: profile.is_active
      },
      session: {
        access_token: authData.session?.access_token,
        refresh_token: authData.session?.refresh_token,
        expires_at: authData.session?.expires_at
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'An error occurred during login',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

