import { supabase } from '../lib/supabase.js';
import { requireAdmin } from '../lib/auth-middleware.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Handle different methods
  if (req.method === 'GET') {
    return handleGetUsers(req, res);
  } else if (req.method === 'POST') {
    return handleCreateUser(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGetUsers(req, res) {
  try {
    // Check authentication and admin access
    const authResult = await requireAdmin(req, res);
    if (!authResult.proceed) {
      return; // Response already sent
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not configured' 
      });
    }

    // Get all user profiles
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch users' 
      });
    }

    return res.status(200).json({
      success: true,
      users: users || []
    });

  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'An error occurred' 
    });
  }
}

async function handleCreateUser(req, res) {
  try {
    // Check authentication and admin access
    const authResult = await requireAdmin(req, res);
    if (!authResult.proceed) {
      return; // Response already sent
    }

    const { first_name, last_name, email, password, is_admin, is_active } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'First name, last name, email, and password are required' 
      });
    }

    // Create user in Supabase Auth
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

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: password,
      email_confirm: true // Auto-confirm email
    });

    if (authError || !authData.user) {
      console.error('Error creating auth user:', authError);
      return res.status(500).json({ 
        success: false, 
        error: authError?.message || 'Failed to create user' 
      });
    }

    // Create user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        first_name,
        last_name,
        email: email.toLowerCase().trim(),
        is_admin: is_admin || false,
        is_active: is_active !== false
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error creating user profile:', profileError);
      // Try to delete the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create user profile' 
      });
    }

    return res.status(200).json({
      success: true,
      user: profile
    });

  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'An error occurred' 
    });
  }
}

