/**
 * Payment Plan Status API
 *
 * GET /api/payment-plan-status?quoteId=xxx
 *
 * Returns payment plan progress and payment history for dashboard display.
 */

import { supabase } from '../lib/supabase.js';
import { requireAuth, isAdmin } from '../lib/auth-middleware.js';
import { getPaymentPlanPayments } from '../lib/payment-plan-utils.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Require authentication
  const authResult = await requireAuth(req, res);
  if (!authResult.proceed) {
    return; // Response already sent by requireAuth
  }
  const { user } = authResult;

  try {
    const { quoteId } = req.query;

    if (!quoteId) {
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

    // Get the quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    if (quoteError || !quote) {
      return res.status(404).json({
        success: false,
        error: 'Quote not found'
      });
    }

    // Check access: user must own the quote or be admin
    if (!isAdmin(user) && quote.created_by_user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Check if this is a payment plan
    if (!quote.is_payment_plan) {
      return res.status(400).json({
        success: false,
        error: 'Quote is not a payment plan'
      });
    }

    // Get payment records
    const payments = await getPaymentPlanPayments(quoteId);

    return res.status(200).json({
      success: true,
      paymentPlan: {
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        customerEmail: quote.customer_email,
        customerName: `${quote.customer_first_name} ${quote.customer_last_name}`,
        totalAmount: parseFloat(quote.payment_plan_total_amount) || 0,
        installments: quote.payment_plan_installments || 0,
        installmentAmount: parseFloat(quote.payment_plan_installment_amount) || 0,
        completedPayments: quote.payment_plan_completed_payments || 0,
        status: quote.payment_plan_status || 'pending',
        subscriptionId: quote.payment_plan_subscription_id,
        payments: (payments || []).map(p => ({
          number: p.payment_number,
          total: p.total_payments,
          amount: parseFloat(p.amount),
          status: p.status,
          paidAt: p.paid_at,
          failedAt: p.failed_at,
          transactionId: p.transaction_id,
          retryCount: p.retry_count
        }))
      }
    });

  } catch (error) {
    console.error('Error in payment-plan-status:', error);
    return res.status(500).json({
      success: false,
      error: 'Error fetching payment plan status',
      message: error.message
    });
  }
}
