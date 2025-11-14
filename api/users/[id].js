import { supabase } from '../../lib/supabase.js';
import { requireAdmin } from '../../lib/auth-middleware.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Handle different methods
  if (req.method === 'PUT') {
    return handleUpdateUser(req, res, id);
  } else if (req.method === 'DELETE') {
    return handleDeleteUser(req, res, id);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleUpdateUser(req, res, userId) {
  try {
    // Check authentication and admin access
    const authResult = await requireAdmin(req, res);
    if (!authResult.proceed) {
      return; // Response already sent
    }

    const { first_name, last_name, email, password, is_admin, is_active } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'First name, last name, and email are required' 
      });
    }

    // Update password if provided
    if (password) {
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

      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { password: password }
      );

      if (passwordError) {
        console.error('Error updating password:', passwordError);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to update password' 
        });
      }
    }

    // Update user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .update({
        first_name,
        last_name,
        email: email.toLowerCase().trim(),
        is_admin: is_admin || false,
        is_active: is_active !== false
      })
      .eq('id', userId)
      .select()
      .single();

    if (profileError) {
      console.error('Error updating user profile:', profileError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to update user profile' 
      });
    }

    return res.status(200).json({
      success: true,
      user: profile
    });

  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'An error occurred' 
    });
  }
}

async function handleDeleteUser(req, res, userId) {
  try {
    // Check authentication and admin access
    const authResult = await requireAdmin(req, res);
    if (!authResult.proceed) {
      return; // Response already sent
    }

    // Check if this is the last admin
    const { data: admins, error: adminCheckError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('is_admin', true)
      .eq('is_active', true);

    if (adminCheckError) {
      console.error('Error checking admins:', adminCheckError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to verify admin status' 
      });
    }

    // Check if user being deleted is an admin
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Prevent deleting the last admin
    if (user.is_admin && admins.length <= 1) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete the last admin user' 
      });
    }

    // Delete user profile (cascade will handle auth user if configured)
    const { error: deleteError } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      console.error('Error deleting user profile:', deleteError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to delete user profile' 
      });
    }

    // Also delete from auth.users
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

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      // Don't fail the request if auth deletion fails, profile is already deleted
    }

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'An error occurred' 
    });
  }
}

