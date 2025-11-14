import { supabase } from './supabase.js';
import { createClient } from '@supabase/supabase-js';

/**
 * Verify authentication session and get user
 * @param {Object} req - Request object
 * @returns {Object} { user: {...}, error: null } or { user: null, error: '...' }
 */
export async function verifyAuth(req) {
  try {
    if (!supabase) {
      return { user: null, error: 'Authentication service not configured' };
    }

    // Get session token from Authorization header or cookies
    const authHeader = req.headers.authorization;
    let sessionToken = authHeader?.replace('Bearer ', '');
    const refreshToken = req.body?.refresh_token;

    // Also check for session in cookies (if set by Supabase Auth)
    if (!sessionToken && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});
      sessionToken = cookies['sb-access-token'] || cookies['supabase-auth-token'];
    }

    if (!sessionToken) {
      return { user: null, error: 'No session found' };
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
      return { user: null, error: 'Invalid or expired session' };
    }

    // Get user profile using admin client to bypass RLS
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
      return { user: null, error: 'User profile not found' };
    }

    if (!profile.is_active) {
      return { user: null, error: 'Account deactivated' };
    }

    return { user: profile, error: null };
  } catch (error) {
    console.error('Auth verification error:', error);
    return { user: null, error: 'Authentication error' };
  }
}

/**
 * Check if user is admin
 * @param {Object} user - User object from verifyAuth
 * @returns {boolean}
 */
export function isAdmin(user) {
  return user && user.is_admin === true;
}

/**
 * Require authentication middleware
 * Returns 401 if not authenticated
 */
export async function requireAuth(req, res) {
  const { user, error } = await verifyAuth(req);

  if (error || !user) {
    return res.status(401).json({
      success: false,
      error: error || 'Authentication required',
      redirect: '/login.html'
    });
  }

  return { user, proceed: true };
}

/**
 * Require admin middleware
 * Returns 403 if not admin
 */
export async function requireAdmin(req, res) {
  const authResult = await requireAuth(req, res);
  
  if (!authResult.proceed) {
    return authResult; // Already sent 401 response
  }

  const { user } = authResult;

  if (!isAdmin(user)) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
      redirect: '/quote-tool.html'
    });
  }

  return { user, proceed: true };
}

