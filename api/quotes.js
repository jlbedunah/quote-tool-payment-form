import { supabase } from '../lib/supabase.js';
import { requireAuth, isAdmin } from '../lib/auth-middleware.js';
import { findOrCreateContact, appendNoteToContact, addTagsToContact } from '../lib/gohighlevel.js';

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

    // Sync to GHL after quote is saved (for payment link quotes)
    let ghlSyncResult = null;
    if (quoteData.delivery_method === 'payment_link' && quoteData.email) {
      try {
        ghlSyncResult = await syncLinkQuoteToGHL(quoteData, quote);
        console.log('GHL sync result:', ghlSyncResult);
      } catch (ghlError) {
        // Log GHL sync errors but don't fail the quote creation
        console.error('GHL sync failed (quote still created):', ghlError);
        ghlSyncResult = {
          success: false,
          error: ghlError.message
        };
      }
    }

    return res.status(200).json({
      success: true,
      quote,
      ghlSync: ghlSyncResult
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

/**
 * Sync quote created via payment link to GoHighLevel
 * - Find or create contact by email
 * - Tag with "link-quote-created" and "quote-created"
 * - Add note with quote details and payment link
 */
async function syncLinkQuoteToGHL(quoteData, savedQuote) {
  const {
    firstName,
    lastName,
    companyName,
    email,
    phone,
    address1,
    address2,
    city,
    state,
    zip,
    services,
    oneTimeTotal,
    subscriptionMonthlyTotal,
    grandTotal,
    payment_link,
    internalComment
  } = quoteData;

  const contactEmail = email?.toLowerCase();

  if (!contactEmail) {
    throw new Error('Email is required to sync quote to GHL');
  }

  // Find or create contact
  const contact = await findOrCreateContact({
    email: contactEmail,
    firstName,
    lastName,
    company: companyName,
    phone,
    address: {
      line1: address1,
      line2: address2,
      city,
      state,
      postalCode: zip,
      country: 'US'
    }
  });

  if (!contact || !contact.id) {
    throw new Error('Failed to find or create GHL contact');
  }

  const contactId = contact.id;

  // Build quote details for note
  const parsedOneTimeTotal = Number(parseFloat(oneTimeTotal ?? grandTotal ?? '0') || 0);
  const parsedSubscriptionTotal = Number(parseFloat(subscriptionMonthlyTotal ?? '0') || 0);

  // Build services list
  let servicesText = '';
  if (services && services.length > 0) {
    services.forEach((service, index) => {
      const serviceName = service[`productName${index}`] || service.productName || 'Service';
      const description = service[`description${index}`] || service.description || '';
      const quantity = service[`quantity${index}`] || service.quantity || '1';
      const unitCost = service[`unitCost${index}`] || service.unitCost || '0';
      const subtotalRaw = service[`subtotal${index}`] || service.subtotal;
      const unitCostNumber = parseFloat(unitCost) || 0;
      const subtotalNumber = subtotalRaw !== undefined ? parseFloat(subtotalRaw) || 0 : unitCostNumber * (parseFloat(quantity) || 1);
      const isSubscription = service[`isSubscription${index}`] === 'true' || service.isSubscription === 'true';
      
      servicesText += `\n• ${serviceName}`;
      if (description) {
        servicesText += ` - ${description}`;
      }
      servicesText += ` (Qty: ${quantity} × $${unitCostNumber.toFixed(2)})`;
      if (isSubscription) {
        servicesText += ' [Subscription]';
      }
      servicesText += ` = $${subtotalNumber.toFixed(2)}`;
    });
  }
  
  // Add internal comment if provided
  if (internalComment && internalComment.trim()) {
    servicesText += `\n\n--- Internal Comment ---\n${internalComment.trim()}`;
  }

  // Build note body
  const noteBody = `🔗 Quote Created (Payment Link)

Quote Number: ${savedQuote?.quote_number || 'N/A'}
Date: ${new Date().toLocaleString()}

Customer Information:
${firstName || ''} ${lastName || ''}${companyName ? `\nCompany: ${companyName}` : ''}${phone ? `\nPhone: ${phone}` : ''}
${address1 || ''}${address2 ? `, ${address2}` : ''}${city ? `\n${city}` : ''}${state ? `, ${state}` : ''} ${zip || ''}

Services:${servicesText || '\nNo services specified'}

Totals:
One-Time Total: $${parsedOneTimeTotal.toFixed(2)}${parsedSubscriptionTotal > 0 ? `\nMonthly Subscription: $${parsedSubscriptionTotal.toFixed(2)}` : ''}

Payment Link:
${payment_link || 'N/A'}`;

  // Add note to contact
  await appendNoteToContact(contactId, noteBody);

  // Add tags: specific tag for link quotes + generic tag for all quotes
  await addTagsToContact(contactId, ['link-quote-created', 'quote-created']);

  return {
    success: true,
    contactId,
    contactEmail
  };
}

