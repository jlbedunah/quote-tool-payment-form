import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: 'Authentication service not configured' 
      });
    }

    // Get the session token from headers or body
    const authHeader = req.headers.authorization;
    const sessionToken = authHeader?.replace('Bearer ', '') || req.body?.session_token;

    // Sign out from Supabase Auth
    if (sessionToken) {
      // Set the session for this request
      const { error } = await supabase.auth.setSession({
        access_token: sessionToken,
        refresh_token: '' // Not needed for logout
      });

      if (error) {
        console.error('Session error:', error);
      }
    }

    // Sign out (clears session)
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error);
      // Still return success even if signOut has issues
    }

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    // Still return success to clear client-side session
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  }
}

