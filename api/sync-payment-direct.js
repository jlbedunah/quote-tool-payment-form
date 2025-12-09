import { syncAuthorizeNetTransaction } from '../lib/authorize-net-sync.js';
import { logInfo, logError } from '../lib/logger.js';

/**
 * Direct payment sync endpoint for local development
 * This allows the payment form to directly trigger GHL sync without waiting for webhooks
 * Only works in development mode (when VERCEL_ENV is not 'production')
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only allow in development/preview environments
  const isProduction = process.env.VERCEL_ENV === 'production';
  if (isProduction) {
    return res.status(403).json({ 
      error: 'This endpoint is only available in development/preview environments',
      message: 'In production, webhooks handle sync automatically'
    });
  }

  try {
    const { transactionId, email, amount, lineItems, invoiceNumber, firstName, lastName } = req.body;

    if (!transactionId || !email) {
      return res.status(400).json({ 
        error: 'transactionId and email are required' 
      });
    }

    console.log('Direct payment sync requested (dev mode):', {
      transactionId,
      email,
      amount,
      environment: process.env.VERCEL_ENV
    });
    
    await logInfo(
      'api/sync-payment-direct.js',
      'Direct payment sync requested (dev mode)',
      {
        transactionId,
        email,
        amount,
        environment: process.env.VERCEL_ENV
      }
    );

    // Build a mock webhook event body from the payment response
    const eventBody = {
      eventType: 'net.authorize.payment.authcapture.created',
      id: `direct-sync-${transactionId}`,
      eventDate: new Date().toISOString(),
      payload: {
        id: transactionId,
        customer: {
          email: email,
          firstName: firstName || '',
          lastName: lastName || ''
        },
        billTo: {
          email: email,
          firstName: firstName || '',
          lastName: lastName || ''
        },
        order: {
          amount: amount,
          invoiceNumber: invoiceNumber,
          lineItems: lineItems || []
        },
        authAmount: amount,
        currencyCode: 'USD'
      }
    };

    // Call the sync function
    const result = await syncAuthorizeNetTransaction(eventBody);

    if (result.skipped) {
      await logInfo(
        'api/sync-payment-direct.js',
        'Direct payment sync skipped',
        {
          transactionId,
          email,
          reason: result.reason
        }
      );
      
      return res.status(200).json({
        success: false,
        skipped: true,
        reason: result.reason,
        result
      });
    }

    await logInfo(
      'api/sync-payment-direct.js',
      'Direct payment sync completed successfully (dev mode)',
      {
        transactionId,
        email,
        contactId: result.contactId
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Payment synced to GHL successfully (dev mode)',
      result
    });

  } catch (error) {
    console.error('Error in direct payment sync:', error);
    
    await logError(
      'api/sync-payment-direct.js',
      'Error in direct payment sync',
      {
        transactionId: req.body?.transactionId,
        email: req.body?.email
      },
      error
    );
    
    return res.status(500).json({
      success: false,
      error: 'Failed to sync payment',
      details: error.message
    });
  }
}


