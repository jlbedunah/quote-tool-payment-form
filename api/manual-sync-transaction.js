import { syncAuthorizeNetTransaction } from '../lib/authorize-net-sync.js';
import { verifyAuth } from '../lib/auth-middleware.js';
import { buildAuthorizeNetConfigPriority } from '../lib/authorize-net-env.js';

/**
 * Manual sync endpoint to retroactively sync a transaction to GHL
 * This can be used if a webhook was missed or failed
 * 
 * Usage:
 * POST /api/manual-sync-transaction
 * {
 *   "transactionId": "abc123",
 *   "email": "customer@example.com" // Optional, will fetch from transaction if not provided
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
    const { transactionId, email } = req.body;

    if (!transactionId && !email) {
      return res.status(400).json({ error: 'Either transactionId or email is required' });
    }

    console.log('Manual sync requested:', {
      transactionId,
      email,
      requestedBy: authResult.user.email
    });

    // If we have a transactionId, fetch transaction details from Authorize.net
    let transactionDetails = null;
    if (transactionId) {
      transactionDetails = await fetchTransactionDetails(transactionId);
      if (!transactionDetails) {
        return res.status(404).json({ 
          error: 'Transaction not found in Authorize.net',
          transactionId 
        });
      }
    }

    // Build webhook event body from transaction details or email
    const eventBody = {
      eventType: 'net.authorize.payment.authcapture.created',
      id: transactionId ? `manual-${transactionId}` : `manual-email-${Date.now()}`,
      eventDate: transactionDetails?.submitTimeUTC || new Date().toISOString(),
      payload: transactionDetails || {
        id: transactionId,
        customer: email ? { email } : null
      }
    };

    // Call the sync function
    const result = await syncAuthorizeNetTransaction(eventBody);

    if (result.skipped) {
      return res.status(200).json({
        success: false,
        skipped: true,
        reason: result.reason,
        result
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Transaction synced successfully',
      result
    });

  } catch (error) {
    console.error('Error in manual sync:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync transaction',
      details: error.message
    });
  }
}

/**
 * Fetch transaction details from Authorize.net
 */
async function fetchTransactionDetails(transId) {
  const attempts = buildAuthorizeNetConfigPriority();
  const { default: nodeFetch } = await import('node-fetch');
  const { XMLBuilder, XMLParser } = await import('fast-xml-parser');

  for (const config of attempts) {
    if (!config.loginId || !config.transactionKey) {
      continue;
    }

    try {
      const builder = new XMLBuilder({ ignoreAttributes: false });
      const parser = new XMLParser({
        ignoreAttributes: false,
        parseTagValue: true,
        parseNodeValue: true,
        trimValues: true,
        parseTrueNumberOnly: false
      });

      const requestPayload = {
        getTransactionDetailsRequest: {
          '@_xmlns': 'AnetApi/xml/v1/schema/AnetApiSchema.xsd',
          merchantAuthentication: {
            name: config.loginId,
            transactionKey: config.transactionKey
          },
          transId
        }
      };

      const xmlBody = builder.build(requestPayload);
      const response = await nodeFetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          Accept: 'application/xml'
        },
        body: xmlBody
      });

      const text = await response.text();

      if (!response.ok) {
        console.warn('Authorize.net getTransactionDetails request failed', {
          status: response.status,
          environment: config.environment
        });
        continue;
      }

      const parsed = parser.parse(text);
      const transaction = parsed?.getTransactionDetailsResponse?.transaction;
      
      if (transaction) {
        return transaction;
      }
    } catch (error) {
      console.warn('Authorize.net transaction detail lookup error', {
        environment: config.environment,
        message: error.message
      });
    }
  }

  return null;
}

