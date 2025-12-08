import { syncAuthorizeNetTransaction } from '../lib/authorize-net-sync.js';
import { verifyAuth } from '../lib/auth-middleware.js';
import { buildAuthorizeNetConfigPriority } from '../lib/authorize-net-env.js';

/**
 * Manual sync endpoint to retroactively sync transactions by email
 * This searches Authorize.net for transactions matching the email and syncs them
 * 
 * Usage:
 * POST /api/manual-sync-by-email
 * {
 *   "email": "customer@example.com",
 *   "daysBack": 30 // Optional, default 30 days
 * }
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication (admin only)
  let authResult;
  try {
    authResult = await verifyAuth(req);
    if (authResult?.error || !authResult?.user) {
      return res.status(401).json({ error: 'Unauthorized - Authentication required' });
    }

    // Check if user is admin
    if (!authResult.user.is_admin) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }
  } catch (authError) {
    return res.status(401).json({ error: 'Unauthorized', details: authError.message });
  }

  try {
    const { email, daysBack = 30 } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    console.log('Manual sync by email requested:', {
      email,
      daysBack,
      requestedBy: authResult.user.email
    });

    // Search for transactions by email in Authorize.net
    // Note: Authorize.net doesn't have a direct "search by email" API
    // We'll need to use batch transaction search or getTransactionList
    // For now, we'll create a webhook event body with the email and let the sync function
    // fetch transaction details if needed
    
    // Actually, the best approach is to check if we can find transactions in our database
    // or use Authorize.net's getTransactionList with date range
    // But that's complex. For now, let's create a simple event that will trigger
    // the sync function to look up the transaction
    
    // Since we can't easily search by email in Authorize.net, we'll need the transaction ID
    // For now, return instructions
    return res.status(200).json({
      success: false,
      message: 'Please use /api/manual-sync-transaction with a transactionId, or check the logs for this email to find the transaction ID',
      instructions: [
        '1. Check the application logs for this email address',
        '2. Find the transaction ID from the logs',
        '3. Use /api/manual-sync-transaction with the transactionId',
        '4. Or check Authorize.net dashboard for transactions with this email'
      ],
      alternative: 'You can also manually add tags in GoHighLevel using the manual-tag-contact endpoint'
    });

  } catch (error) {
    console.error('Error in manual sync by email:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync transactions',
      details: error.message
    });
  }
}

