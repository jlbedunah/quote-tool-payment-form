import { supabase } from '../lib/supabase.js';
import { requireAuth, isAdmin } from '../lib/auth-middleware.js';

export default async function handler(req, res) {
  // Handle different methods
  if (req.method === 'GET') {
    return handleGetQuotes(req, res);
  } else if (req.method === 'POST') {
    return handleCreateQuote(req, res);
  } else if (req.method === 'PUT') {
    return handleUpdateQuote(req, res);
  } else if (req.method === 'DELETE') {
    return handleDeleteQuote(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGetQuotes(req, res) {
  try {
    // Check authentication (all authenticated users can see quotes)
    const authResult = await requireAuth(req, res);
    if (!authResult.proceed) {
      return; // Response already sent
    }

    const { user } = authResult;

    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not configured' 
      });
    }

    // Build query - admins see all, regular users see only their own
    let query = supabase
      .from('quotes')
      .select('*');

    // Filter by user_id if not admin
    if (!isAdmin(user)) {
      query = query.eq('created_by_user_id', user.id);
    }

    const { data: quotes, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quotes:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch quotes' 
      });
    }

    return res.status(200).json({
      success: true,
      quotes: quotes || []
    });

  } catch (error) {
    console.error('Get quotes error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'An error occurred' 
    });
  }
}

async function handleCreateQuote(req, res) {
  try {
    // Check authentication
    const authResult = await requireAuth(req, res);
    if (!authResult.proceed) {
      return;
    }

    const { user } = authResult;
    const quoteData = req.body;

    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not configured' 
      });
    }

    // Generate quote number using database function
    const { data: quoteNumberData, error: quoteNumberError } = await supabase
      .rpc('generate_quote_number');

    const quoteNumber = quoteNumberError ? `Q-${new Date().getFullYear()}-${Date.now()}` : quoteNumberData;

    // Transform quote data to match database schema
    const quoteToSave = {
      id: `quote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      quote_number: quoteNumber,
      status: quoteData.delivery_method === 'email' ? 'emailed' : 'pending',
      customer_first_name: quoteData.firstName || '',
      customer_last_name: quoteData.lastName || '',
      customer_email: quoteData.email || '',
      customer_phone: quoteData.phone || null,
      customer_company_name: quoteData.companyName || null,
      customer_address1: quoteData.address1 || null,
      customer_address2: quoteData.address2 || null,
      customer_city: quoteData.city || null,
      customer_state: quoteData.state || null,
      customer_zip: quoteData.zip || null,
      services: quoteData.services || [],
      totals: {
        one_time_total: parseFloat(quoteData.oneTimeTotal || quoteData.grandTotal || 0),
        subscription_monthly_total: parseFloat(quoteData.subscriptionMonthlyTotal || 0),
        grand_total: parseFloat(quoteData.grandTotal || quoteData.oneTimeTotal || 0)
      },
      delivery_method: quoteData.delivery_method || 'payment_link',
      payment_link: quoteData.payment_link || null,
      payment_status: 'pending',
      created_by_user_id: user.id
    };

    const { data: quote, error } = await supabase
      .from('quotes')
      .insert(quoteToSave)
      .select()
      .single();

    if (error) {
      console.error('Error creating quote:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create quote: ' + error.message 
      });
    }

    return res.status(200).json({
      success: true,
      quote
    });

  } catch (error) {
    console.error('Create quote error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'An error occurred' 
    });
  }
}

async function handleUpdateQuote(req, res) {
  try {
    // Check authentication
    const authResult = await requireAuth(req, res);
    if (!authResult.proceed) {
      return;
    }

    const { user } = authResult;
    const { id, ...quoteData } = req.body;

    if (!id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Quote ID is required' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not configured' 
      });
    }

    // Check if user can update this quote
    const { data: existingQuote, error: fetchError } = await supabase
      .from('quotes')
      .select('created_by_user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingQuote) {
      return res.status(404).json({ 
        success: false, 
        error: 'Quote not found' 
      });
    }

    // Non-admins can only update their own quotes
    if (!isAdmin(user) && existingQuote.created_by_user_id !== user.id) {
      return res.status(403).json({ 
        success: false, 
        error: 'You can only update your own quotes' 
      });
    }

    const { data: quote, error } = await supabase
      .from('quotes')
      .update(quoteData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating quote:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to update quote' 
      });
    }

    return res.status(200).json({
      success: true,
      quote
    });

  } catch (error) {
    console.error('Update quote error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'An error occurred' 
    });
  }
}

async function handleDeleteQuote(req, res) {
  try {
    // Check authentication
    const authResult = await requireAuth(req, res);
    if (!authResult.proceed) {
      return;
    }

    const { user } = authResult;
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Quote ID is required' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database not configured' 
      });
    }

    // Check if user can delete this quote
    const { data: existingQuote, error: fetchError } = await supabase
      .from('quotes')
      .select('created_by_user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingQuote) {
      return res.status(404).json({ 
        success: false, 
        error: 'Quote not found' 
      });
    }

    // Non-admins can only delete their own quotes
    if (!isAdmin(user) && existingQuote.created_by_user_id !== user.id) {
      return res.status(403).json({ 
        success: false, 
        error: 'You can only delete your own quotes' 
      });
    }

    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting quote:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to delete quote' 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Quote deleted successfully'
    });

  } catch (error) {
    console.error('Delete quote error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'An error occurred' 
    });
  }
}

