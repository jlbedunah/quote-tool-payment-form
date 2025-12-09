import nodeFetch from 'node-fetch';

/**
 * Sends a purchase event to GA4 using the Measurement Protocol API
 * This allows server-side tracking of purchases from Authorize.net webhooks
 * 
 * @param {Object} transactionData - Transaction data from Authorize.net
 * @param {string} transactionData.transactionId - Authorize.net transaction ID
 * @param {number} transactionData.amount - Transaction amount
 * @param {string} transactionData.currency - Currency code (default: USD)
 * @param {string} transactionData.email - Customer email (for client_id generation)
 * @param {Array} transactionData.items - Array of purchased items
 * @param {string} transactionData.invoiceNumber - Invoice number (optional)
 * @returns {Promise<Object>} Result of the GA4 API call
 */
export async function sendGA4PurchaseEvent(transactionData) {
    const measurementId = process.env.GA4_MEASUREMENT_ID || 'G-8ZN40WHZ74';
    const apiSecret = process.env.GA4_API_SECRET;

    if (!apiSecret) {
        console.warn('GA4_API_SECRET not configured. Skipping GA4 purchase event tracking.');
        return { skipped: true, reason: 'GA4_API_SECRET not configured' };
    }

    if (!transactionData.transactionId || !transactionData.amount) {
        console.warn('Missing required transaction data for GA4 tracking:', {
            hasTransactionId: !!transactionData.transactionId,
            hasAmount: !!transactionData.amount
        });
        return { skipped: true, reason: 'Missing required transaction data' };
    }

    // Generate a client_id from email or use transaction ID as fallback
    // GA4 requires a client_id - we'll use a hash of the email or transaction ID
    const clientId = generateClientId(transactionData.email || transactionData.transactionId);

    // Build items array for GA4
    const items = (transactionData.items || []).map((item, index) => ({
        item_id: item.itemId || item.id || `item_${index}`,
        item_name: item.name || item.productName || `Item ${index + 1}`,
        category: item.category || 'Bookkeeping Services',
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || Number(item.unitPrice) || 0
    }));

    // Build the purchase event payload
    const eventPayload = {
        client_id: clientId,
        events: [
            {
                name: 'purchase',
                params: {
                    transaction_id: transactionData.transactionId,
                    value: Number(transactionData.amount),
                    currency: transactionData.currency || 'USD',
                    items: items,
                    ...(transactionData.invoiceNumber && { invoice_number: transactionData.invoiceNumber })
                }
            }
        ]
    };

    // GA4 Measurement Protocol endpoint
    const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

    try {
        console.log('Sending GA4 purchase event:', {
            transactionId: transactionData.transactionId,
            amount: transactionData.amount,
            itemsCount: items.length,
            endpoint: endpoint.replace(apiSecret, '***')
        });

        const response = await nodeFetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventPayload)
        });

        if (response.ok) {
            console.log('GA4 purchase event sent successfully:', {
                transactionId: transactionData.transactionId,
                status: response.status
            });
            return { success: true, status: response.status };
        } else {
            const errorText = await response.text();
            console.error('Failed to send GA4 purchase event:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            return { success: false, status: response.status, error: errorText };
        }
    } catch (error) {
        console.error('Error sending GA4 purchase event:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generates a client_id for GA4 from an email or transaction ID
 * GA4 requires a client_id - we'll create a deterministic hash
 * 
 * @param {string} identifier - Email or transaction ID
 * @returns {string} Client ID (UUID format)
 */
function generateClientId(identifier) {
    // Use a simple hash to create a deterministic client_id
    // This ensures the same email/transaction gets the same client_id
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
        const char = identifier.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to a UUID-like format (GA4 accepts various formats)
    // Using a simple approach: hash-based UUID v4-like format
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex.substring(0, 8)}-${hex.substring(0, 4)}-4${hex.substring(0, 3)}-${(hash & 0x3fff | 0x8000).toString(16).substring(0, 4)}-${hex.substring(0, 12)}`.substring(0, 36);
}




