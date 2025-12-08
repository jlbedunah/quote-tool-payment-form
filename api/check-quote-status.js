import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, amount } = req.body;

    if (!email) {
      return res.status(400).json({ 
        isPaid: false, 
        error: 'Email is required' 
      });
    }

    if (!supabase) {
      // If Supabase not configured, fail open (allow payment)
      return res.status(200).json({ 
        isPaid: false,
        message: 'Database not configured' 
      });
    }

    // Normalize email (lowercase, trim)
    const normalizedEmail = email.toLowerCase().trim();

    // Build query - find paid quotes for this email
    let query = supabase
      .from('quotes')
      .select('id, quote_number, payment_status, payment_paid_at, payment_transaction_id, payment_amount, created_at')
      .eq('payment_status', 'paid')
      .ilike('customer_email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1);

    // If amount is provided, try to match by amount as well (more precise)
    // But we'll still return the most recent paid quote if amount doesn't match
    const { data: quotes, error } = await query;

    if (error) {
      console.error('Error checking quote status:', error);
      // Fail open - allow payment if check fails
      return res.status(200).json({ 
        isPaid: false,
        message: 'Error checking quote status' 
      });
    }

    if (!quotes || quotes.length === 0) {
      // No paid quote found
      return res.status(200).json({ 
        isPaid: false,
        quoteId: null,
        message: 'No paid quote found for this email' 
      });
    }

    const quote = quotes[0];

    // If amount was provided and it doesn't match, still return the paid quote
    // (customer might have multiple quotes, we want to prevent payment on any paid one)
    if (amount && quote.payment_amount) {
      const quoteAmount = parseFloat(quote.payment_amount);
      const requestedAmount = parseFloat(amount);
      // Allow small differences due to rounding
      if (Math.abs(quoteAmount - requestedAmount) > 0.01) {
        // Amount doesn't match, but quote is still paid - return it anyway
        // This prevents double payment even if amounts differ slightly
      }
    }

    // Quote is paid
    return res.status(200).json({
      isPaid: true,
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      paidAt: quote.payment_paid_at,
      transactionId: quote.payment_transaction_id,
      amount: quote.payment_amount
    });

  } catch (error) {
    console.error('Error in check-quote-status:', error);
    // Fail open - allow payment if check fails
    return res.status(200).json({ 
      isPaid: false,
      error: 'Error checking quote status',
      message: error.message 
    });
  }
}

