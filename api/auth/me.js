import { supabase } from '../../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Allow both GET and POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: 'Authentication service not configured' 
      });
    }

    // Get session from Authorization header, request body, or cookies
    const authHeader = req.headers.authorization;
    let sessionToken = authHeader?.replace('Bearer ', '');
    const refreshToken = req.body?.refresh_token;
    
    // Also check cookies (if session stored in cookie)
    if (!sessionToken && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});
      sessionToken = cookies['sb-access-token'] || cookies['supabase-auth-token'];
    }

    if (!sessionToken) {
      return res.status(401).json({ 
        success: false, 
        error: 'No session token provided' 
      });
    }

    // Create anon client to verify user token
    const supabaseAnon = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Try to set session if we have refresh token, otherwise try getUser
    let userData;
    let userError;
    
    if (refreshToken) {
      // Use setSession with both tokens
      const { data: sessionData, error: sessionError } = await supabaseAnon.auth.setSession({
        access_token: sessionToken,
        refresh_token: refreshToken
      });
      
      if (sessionError || !sessionData.user) {
        userError = sessionError;
        userData = null;
      } else {
        userData = sessionData;
        userError = null;
      }
    } else {
      // Try getUser with access token
      try {
        const result = await supabaseAnon.auth.getUser(sessionToken);
        userData = result.data;
        userError = result.error;
      } catch (err) {
        // If getUser doesn't work, decode JWT to get user ID
        try {
          const parts = sessionToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            // Use admin client to get user directly
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
            
            // Get user from auth.users using admin client
            const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(payload.sub);
            
            if (authError || !authUser) {
              userError = authError;
              userData = null;
            } else {
              userData = { user: authUser.user };
              userError = null;
            }
          } else {
            throw new Error('Invalid token format');
          }
        } catch (decodeError) {
          console.error('Token decode error:', decodeError);
          userError = decodeError;
          userData = null;
        }
      }
    }

    if (userError || !userData?.user) {
      console.error('Get user error:', userError);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired session' 
      });
    }

    // Get user profile from user_profiles table using admin client to bypass RLS
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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, first_name, last_name, email, is_admin, is_active')
      .eq('id', userData.user.id)
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
        error: 'Your account has been deactivated' 
      });
    }

    // Return user data
    return res.status(200).json({
      success: true,
      user: {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        is_admin: profile.is_admin,
        is_active: profile.is_active
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'An error occurred' 
    });
  }
}

