/**
 * Payment Plan Utilities
 *
 * Functions for managing payment plans - splitting totals into installments,
 * tracking payments, and handling webhook events.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

// ============================================
// Payment Calculation Functions
// ============================================

/**
 * Calculate payment plan installment amounts.
 * First payment gets any remainder cent to handle rounding.
 *
 * @param {number} totalAmount - Total amount to be split
 * @param {number} installments - Number of payments (2-12)
 * @returns {Object} { firstPayment, recurringAmount, totalOccurrences }
 *
 * @example
 * calculatePaymentPlanAmounts(2980, 3)
 * // Returns: { firstPayment: 993.34, recurringAmount: 993.33, totalOccurrences: 2 }
 */
export function calculatePaymentPlanAmounts(totalAmount, installments) {
  if (!totalAmount || totalAmount <= 0) {
    throw new Error('Total amount must be greater than 0');
  }
  if (!installments || installments < 2 || installments > 12) {
    throw new Error('Installments must be between 2 and 12');
  }

  // Calculate base amount (rounded down to cents)
  const baseAmount = Math.floor((totalAmount * 100) / installments) / 100;

  // Calculate remainder (difference between total and sum of base amounts)
  const sumOfBaseAmounts = baseAmount * installments;
  const remainder = Math.round((totalAmount - sumOfBaseAmounts) * 100) / 100;

  // First payment gets the extra cents
  const firstPayment = Math.round((baseAmount + remainder) * 100) / 100;

  return {
    firstPayment,
    recurringAmount: baseAmount,
    totalOccurrences: installments - 1  // ARB handles remaining payments after first
  };
}

/**
 * Validate that a payment plan configuration is valid.
 *
 * @param {number} totalAmount - Total amount
 * @param {number} installments - Number of payments
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validatePaymentPlan(totalAmount, installments) {
  if (!totalAmount || isNaN(totalAmount)) {
    return { valid: false, error: 'Invalid total amount' };
  }
  if (totalAmount < 1) {
    return { valid: false, error: 'Total amount must be at least $1' };
  }
  if (!installments || isNaN(installments)) {
    return { valid: false, error: 'Invalid number of installments' };
  }
  if (installments < 2 || installments > 12) {
    return { valid: false, error: 'Installments must be between 2 and 12' };
  }

  // Ensure each payment is at least $1
  const { recurringAmount } = calculatePaymentPlanAmounts(totalAmount, installments);
  if (recurringAmount < 1) {
    return { valid: false, error: `Minimum payment would be $${recurringAmount.toFixed(2)}. Each payment must be at least $1.00` };
  }

  return { valid: true };
}

// ============================================
// Database Functions
// ============================================

/**
 * Get a quote by its Authorize.net ARB subscription ID.
 *
 * @param {string} subscriptionId - Authorize.net subscription ID
 * @returns {Object|null} Quote object or null if not found
 */
export async function getQuoteBySubscriptionId(subscriptionId) {
  if (!isSupabaseConfigured() || !subscriptionId) {
    console.warn('[PaymentPlan] Cannot get quote: Supabase not configured or missing subscription ID');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('payment_plan_subscription_id', subscriptionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found - not an error, just means subscription not linked to a quote
        console.log(`[PaymentPlan] No quote found for subscription ID: ${subscriptionId}`);
        return null;
      }
      console.error('[PaymentPlan] Error finding quote by subscription ID:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[PaymentPlan] Exception finding quote by subscription ID:', err);
    return null;
  }
}

/**
 * Get a quote by ID.
 *
 * @param {string} quoteId - Quote ID
 * @returns {Object|null} Quote object or null if not found
 */
export async function getQuoteById(quoteId) {
  if (!isSupabaseConfigured() || !quoteId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    if (error) {
      console.error('[PaymentPlan] Error finding quote by ID:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[PaymentPlan] Exception finding quote by ID:', err);
    return null;
  }
}

/**
 * Update quote with payment plan subscription details.
 *
 * @param {string} quoteId - Quote ID
 * @param {Object} updateData - Fields to update
 * @returns {Object|null} Updated quote or null on error
 */
export async function updateQuotePaymentPlan(quoteId, updateData) {
  if (!isSupabaseConfigured() || !quoteId) {
    console.warn('[PaymentPlan] Cannot update quote: Supabase not configured or missing quote ID');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('quotes')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', quoteId)
      .select()
      .single();

    if (error) {
      console.error('[PaymentPlan] Error updating quote payment plan:', error);
      return null;
    }

    console.log(`[PaymentPlan] Updated quote ${quoteId}:`, updateData);
    return data;
  } catch (err) {
    console.error('[PaymentPlan] Exception updating quote payment plan:', err);
    return null;
  }
}

/**
 * Create initial payment records for a payment plan.
 * Called when a payment plan is created.
 *
 * @param {string} quoteId - Quote ID
 * @param {number} installments - Total number of payments
 * @param {number} firstPaymentAmount - Amount for first payment
 * @param {number} recurringAmount - Amount for subsequent payments
 * @returns {Array|null} Created payment records or null on error
 */
export async function createPaymentPlanRecords(quoteId, installments, firstPaymentAmount, recurringAmount) {
  if (!isSupabaseConfigured() || !quoteId) {
    console.warn('[PaymentPlan] Cannot create payment records: Supabase not configured or missing quote ID');
    return null;
  }

  try {
    const records = [];

    // First payment record (different amount due to rounding)
    records.push({
      quote_id: quoteId,
      payment_number: 1,
      total_payments: installments,
      amount: firstPaymentAmount,
      status: 'pending'
    });

    // Remaining payment records
    for (let i = 2; i <= installments; i++) {
      records.push({
        quote_id: quoteId,
        payment_number: i,
        total_payments: installments,
        amount: recurringAmount,
        status: 'pending'
      });
    }

    const { data, error } = await supabase
      .from('payment_plan_payments')
      .insert(records)
      .select();

    if (error) {
      console.error('[PaymentPlan] Error creating payment records:', error);
      return null;
    }

    console.log(`[PaymentPlan] Created ${records.length} payment records for quote ${quoteId}`);
    return data;
  } catch (err) {
    console.error('[PaymentPlan] Exception creating payment records:', err);
    return null;
  }
}

/**
 * Update a specific payment plan payment record.
 * Uses upsert to handle both create and update scenarios.
 *
 * @param {string} quoteId - Quote ID
 * @param {number} paymentNumber - Payment number (1, 2, 3, etc.)
 * @param {Object} updateData - Fields to update (status, transaction_id, paid_at, etc.)
 * @returns {Object|null} Updated payment record or null on error
 */
export async function updatePaymentPlanPayment(quoteId, paymentNumber, updateData) {
  if (!isSupabaseConfigured() || !quoteId) {
    console.warn('[PaymentPlan] Cannot update payment: Supabase not configured or missing quote ID');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('payment_plan_payments')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('quote_id', quoteId)
      .eq('payment_number', paymentNumber)
      .select()
      .single();

    if (error) {
      console.error('[PaymentPlan] Error updating payment record:', error);
      return null;
    }

    console.log(`[PaymentPlan] Updated payment ${paymentNumber} for quote ${quoteId}:`, updateData);
    return data;
  } catch (err) {
    console.error('[PaymentPlan] Exception updating payment record:', err);
    return null;
  }
}

/**
 * Get all payment records for a payment plan quote.
 *
 * @param {string} quoteId - Quote ID
 * @returns {Array|null} Array of payment records or null on error
 */
export async function getPaymentPlanPayments(quoteId) {
  if (!isSupabaseConfigured() || !quoteId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('payment_plan_payments')
      .select('*')
      .eq('quote_id', quoteId)
      .order('payment_number', { ascending: true });

    if (error) {
      console.error('[PaymentPlan] Error getting payment records:', error);
      return null;
    }

    return data || [];
  } catch (err) {
    console.error('[PaymentPlan] Exception getting payment records:', err);
    return null;
  }
}

// ============================================
// Webhook Event Handlers
// ============================================

/**
 * Handle a payment plan payment event from Authorize.net webhook.
 * Called when an ARB subscription payment succeeds.
 *
 * @param {Object} eventBody - Webhook event body from Authorize.net
 * @returns {Object} Result object { success, skipped, quoteId, paymentNumber, isComplete, error }
 */
export async function handlePaymentPlanPayment(eventBody) {
  try {
    const subscriptionId = eventBody.payload?.subscription?.id;
    const transactionId = eventBody.payload?.id;
    const amount = parseFloat(eventBody.payload?.authAmount || 0);

    if (!subscriptionId) {
      return { skipped: true, reason: 'No subscription ID in event' };
    }

    // Find quote by subscription ID
    const quote = await getQuoteBySubscriptionId(subscriptionId);
    if (!quote) {
      return { skipped: true, reason: 'No quote found for subscription ID' };
    }
    if (!quote.is_payment_plan) {
      return { skipped: true, reason: 'Quote is not a payment plan' };
    }

    // Calculate the next payment number
    // completed_payments is the count of payments already done
    // So next payment is completed + 1, but remember payment 1 is the immediate charge
    // ARB payments start at payment 2
    const currentCompleted = quote.payment_plan_completed_payments || 0;
    const nextPaymentNumber = currentCompleted + 1;

    if (nextPaymentNumber > quote.payment_plan_installments) {
      console.warn(`[PaymentPlan] Payment ${nextPaymentNumber} exceeds total installments ${quote.payment_plan_installments}`);
      return { skipped: true, reason: 'Payment number exceeds total installments' };
    }

    // Update the payment record
    await updatePaymentPlanPayment(quote.id, nextPaymentNumber, {
      status: 'paid',
      transaction_id: transactionId,
      paid_at: new Date().toISOString()
    });

    // Update quote progress
    const newCompletedCount = nextPaymentNumber;
    const isComplete = newCompletedCount >= quote.payment_plan_installments;

    const quoteUpdate = {
      payment_plan_completed_payments: newCompletedCount,
      payment_plan_status: isComplete ? 'completed' : 'active'
    };

    // If all payments complete, also mark the overall payment as paid
    if (isComplete) {
      quoteUpdate.payment_status = 'paid';
      quoteUpdate.payment_paid_at = new Date().toISOString();
    }

    await updateQuotePaymentPlan(quote.id, quoteUpdate);

    console.log(`[PaymentPlan] Processed payment ${nextPaymentNumber}/${quote.payment_plan_installments} for quote ${quote.id}`);

    return {
      success: true,
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      paymentNumber: nextPaymentNumber,
      totalPayments: quote.payment_plan_installments,
      isComplete,
      transactionId
    };
  } catch (err) {
    console.error('[PaymentPlan] Error handling payment plan payment:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Handle a payment plan suspension event.
 * Called when Authorize.net suspends a subscription after failed retries.
 *
 * @param {Object} eventBody - Webhook event body from Authorize.net
 * @returns {Object} Result object { success, skipped, quoteId, error }
 */
export async function handlePaymentPlanSuspension(eventBody) {
  try {
    const subscriptionId = eventBody.payload?.subscription?.id ||
      eventBody.payload?.id;

    if (!subscriptionId) {
      return { skipped: true, reason: 'No subscription ID in event' };
    }

    const quote = await getQuoteBySubscriptionId(subscriptionId);
    if (!quote) {
      return { skipped: true, reason: 'No quote found for subscription ID' };
    }
    if (!quote.is_payment_plan) {
      return { skipped: true, reason: 'Quote is not a payment plan' };
    }

    // Mark the payment plan as suspended
    await updateQuotePaymentPlan(quote.id, {
      payment_plan_status: 'suspended'
    });

    // Mark the current payment as failed
    const nextPaymentNumber = (quote.payment_plan_completed_payments || 0) + 1;
    await updatePaymentPlanPayment(quote.id, nextPaymentNumber, {
      status: 'failed',
      failed_at: new Date().toISOString()
    });

    console.log(`[PaymentPlan] Payment plan suspended for quote ${quote.id}`);

    // TODO: Send notification to admin about suspended payment plan

    return {
      success: true,
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      status: 'suspended'
    };
  } catch (err) {
    console.error('[PaymentPlan] Error handling payment plan suspension:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Handle payment plan cancellation.
 *
 * @param {Object} eventBody - Webhook event body from Authorize.net
 * @returns {Object} Result object { success, skipped, quoteId, error }
 */
export async function handlePaymentPlanCancellation(eventBody) {
  try {
    const subscriptionId = eventBody.payload?.subscription?.id ||
      eventBody.payload?.id;

    if (!subscriptionId) {
      return { skipped: true, reason: 'No subscription ID in event' };
    }

    const quote = await getQuoteBySubscriptionId(subscriptionId);
    if (!quote) {
      return { skipped: true, reason: 'No quote found for subscription ID' };
    }
    if (!quote.is_payment_plan) {
      return { skipped: true, reason: 'Quote is not a payment plan' };
    }

    // Mark the payment plan as cancelled
    await updateQuotePaymentPlan(quote.id, {
      payment_plan_status: 'cancelled'
    });

    console.log(`[PaymentPlan] Payment plan cancelled for quote ${quote.id}`);

    return {
      success: true,
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      status: 'cancelled'
    };
  } catch (err) {
    console.error('[PaymentPlan] Error handling payment plan cancellation:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Mark the first payment (immediate charge) as completed.
 * Called after the initial payment succeeds.
 *
 * @param {string} quoteId - Quote ID
 * @param {string} transactionId - Authorize.net transaction ID
 * @param {string} subscriptionId - ARB subscription ID for recurring payments
 * @returns {Object|null} Updated quote or null on error
 */
export async function markFirstPaymentComplete(quoteId, transactionId, subscriptionId) {
  if (!isSupabaseConfigured() || !quoteId) {
    return null;
  }

  try {
    // Update the first payment record
    await updatePaymentPlanPayment(quoteId, 1, {
      status: 'paid',
      transaction_id: transactionId,
      paid_at: new Date().toISOString()
    });

    // Update the quote
    const quoteUpdate = {
      payment_plan_completed_payments: 1,
      payment_plan_status: 'active',
      payment_plan_subscription_id: subscriptionId,
      payment_transaction_id: transactionId  // Also store on the quote for easy access
    };

    const updatedQuote = await updateQuotePaymentPlan(quoteId, quoteUpdate);

    console.log(`[PaymentPlan] First payment marked complete for quote ${quoteId}`);

    return updatedQuote;
  } catch (err) {
    console.error('[PaymentPlan] Error marking first payment complete:', err);
    return null;
  }
}

// ============================================
// Date Utilities
// ============================================

/**
 * Get the start date for ARB subscription (next month from today).
 * Authorize.net requires date in YYYY-MM-DD format.
 *
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getNextMonthDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().split('T')[0];
}

/**
 * Get the 1st of next month.
 * Used for monthly subscriptions to start on a consistent date.
 * Handles year rollover (December → January of next year).
 *
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getFirstOfNextMonth() {
  const today = new Date();
  // Move to next month, day 1
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

/**
 * Get a date 2 weeks (14 days) from today.
 * Used for payment plan bi-weekly recurring payments.
 *
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getTwoWeeksFromNow() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().split('T')[0];
}

/**
 * Format a date for display.
 *
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
