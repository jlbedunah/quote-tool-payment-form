import nodeFetch from 'node-fetch';

/**
 * Sends a notification to Slack via Incoming Webhook
 * 
 * @param {Object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.text - Main notification text
 * @param {Array} options.fields - Array of {title, value, short} field objects
 * @param {string} options.color - Color bar (good, warning, danger, or hex color)
 * @param {string} options.emoji - Emoji icon for the notification
 * @returns {Promise<Object>} Result of the Slack API call
 */
export async function sendSlackNotification({ title, text, fields = [], color = 'good', emoji = '📢' }) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
        console.warn('SLACK_WEBHOOK_URL not configured. Skipping Slack notification.');
        return { skipped: true, reason: 'SLACK_WEBHOOK_URL not configured' };
    }

    // Build Slack message payload
    const payload = {
        text: `${emoji} ${title}`,
        attachments: [
            {
                color: color,
                text: text,
                fields: fields.map(field => ({
                    title: field.title,
                    value: field.value || 'N/A',
                    short: field.short !== false // Default to short (side-by-side)
                })),
                footer: 'Quote Tool & Payment System',
                ts: Math.floor(Date.now() / 1000) // Unix timestamp
            }
        ]
    };

    try {
        console.log('Sending Slack notification:', {
            title,
            fieldsCount: fields.length,
            webhookUrl: webhookUrl.substring(0, 30) + '...' // Log partial URL for debugging
        });

        const response = await nodeFetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const responseText = await response.text();
            console.log('Slack notification sent successfully');
            return { success: true, status: response.status, response: responseText };
        } else {
            const errorText = await response.text();
            console.error('Failed to send Slack notification:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            return { success: false, status: response.status, error: errorText };
        }
    } catch (error) {
        console.error('Error sending Slack notification:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sends a Slack notification when a quote is sent
 * 
 * @param {Object} quoteData - Quote data
 * @param {string} quoteData.customerName - Customer name
 * @param {string} quoteData.customerEmail - Customer email
 * @param {number} quoteData.totalAmount - Total quote amount
 * @param {Array} quoteData.services - Array of services/items
 * @param {string} quoteData.quoteNumber - Quote number (optional)
 * @param {string} quoteData.quoteId - Quote ID in database (optional)
 * @returns {Promise<Object>} Result of the Slack API call
 */
export async function notifyQuoteSent(quoteData) {
    const { customerName, customerEmail, totalAmount, services = [], quoteNumber, quoteId } = quoteData;

    const fields = [
        {
            title: 'Customer',
            value: customerName ? `${customerName} (${customerEmail})` : customerEmail,
            short: true
        },
        {
            title: 'Amount',
            value: formatCurrency(totalAmount),
            short: true
        },
        {
            title: 'Services',
            value: services.length > 0 
                ? `${services.length} item${services.length !== 1 ? 's' : ''}`
                : 'No services',
            short: true
        }
    ];

    if (quoteNumber) {
        fields.push({
            title: 'Quote #',
            value: quoteNumber,
            short: true
        });
    }

    // Add service details if available
    if (services.length > 0 && services.length <= 5) {
        const serviceList = services
            .map(s => `• ${s.name || s.productName || 'Service'} (${formatCurrency(s.subtotal || s.unitPrice || 0)})`)
            .join('\n');
        fields.push({
            title: 'Items',
            value: serviceList,
            short: false
        });
    }

    return await sendSlackNotification({
        title: 'Quote Sent',
        text: `A new quote has been sent to ${customerName || customerEmail}`,
        fields,
        color: '#36a64f', // Green
        emoji: '📧'
    });
}

/**
 * Sends a Slack notification when a sale is made through Authorize.net
 * 
 * @param {Object} saleData - Sale/transaction data
 * @param {string} saleData.customerName - Customer name
 * @param {string} saleData.customerEmail - Customer email
 * @param {number} saleData.amount - Transaction amount
 * @param {string} saleData.transactionId - Authorize.net transaction ID
 * @param {string} saleData.invoiceNumber - Invoice number (optional)
 * @param {Array} saleData.items - Array of purchased items (optional)
 * @param {string} saleData.currency - Currency code (default: USD)
 * @returns {Promise<Object>} Result of the Slack API call
 */
export async function notifySaleMade(saleData) {
    const { 
        customerName, 
        customerEmail, 
        amount, 
        transactionId, 
        invoiceNumber, 
        items = [],
        currency = 'USD'
    } = saleData;

    const fields = [
        {
            title: 'Customer',
            value: customerName ? `${customerName} (${customerEmail})` : customerEmail,
            short: true
        },
        {
            title: 'Amount',
            value: formatCurrency(amount, currency),
            short: true
        },
        {
            title: 'Transaction ID',
            value: transactionId || 'N/A',
            short: true
        }
    ];

    if (invoiceNumber) {
        fields.push({
            title: 'Invoice #',
            value: invoiceNumber,
            short: true
        });
    }

    // Add item details if available
    if (items.length > 0) {
        const itemList = items
            .slice(0, 5) // Limit to first 5 items
            .map(item => {
                const name = item.name || item.productName || 'Item';
                const qty = item.quantity || 1;
                const price = item.price || item.unitPrice || 0;
                return `• ${name} (${qty}x ${formatCurrency(price, currency)})`;
            })
            .join('\n');
        
        if (items.length > 5) {
            fields.push({
                title: 'Items',
                value: `${itemList}\n... and ${items.length - 5} more`,
                short: false
            });
        } else {
            fields.push({
                title: 'Items',
                value: itemList,
                short: false
            });
        }
    }

    fields.push({
        title: 'Status',
        value: '✅ Paid',
        short: true
    });

    return await sendSlackNotification({
        title: 'Sale Made',
        text: `A new payment has been processed through Authorize.net`,
        fields,
        color: '#2eb886', // Teal/green for success
        emoji: '💰'
    });
}

/**
 * Sends a Slack notification when a subscription is created through Authorize.net
 * 
 * @param {Object} subscriptionData - Subscription data
 * @param {string} subscriptionData.customerName - Customer name
 * @param {string} subscriptionData.customerEmail - Customer email
 * @param {number} subscriptionData.amount - Subscription amount
 * @param {string} subscriptionData.subscriptionId - Authorize.net subscription ID
 * @param {string} subscriptionData.subscriptionName - Subscription name (optional)
 * @param {string} subscriptionData.interval - Billing interval (monthly, quarterly, etc.)
 * @param {string} subscriptionData.status - Subscription status (optional)
 * @param {string} subscriptionData.currency - Currency code (default: USD)
 * @returns {Promise<Object>} Result of the Slack API call
 */
export async function notifySubscriptionCreated(subscriptionData) {
    const { 
        customerName, 
        customerEmail, 
        amount, 
        subscriptionId, 
        subscriptionName,
        interval,
        status,
        currency = 'USD'
    } = subscriptionData;

    const fields = [
        {
            title: 'Customer',
            value: customerName ? `${customerName} (${customerEmail})` : customerEmail,
            short: true
        },
        {
            title: 'Amount',
            value: formatCurrency(amount, currency),
            short: true
        },
        {
            title: 'Billing Interval',
            value: interval ? interval.charAt(0).toUpperCase() + interval.slice(1) : 'N/A',
            short: true
        },
        {
            title: 'Subscription ID',
            value: subscriptionId || 'N/A',
            short: true
        }
    ];

    if (subscriptionName) {
        fields.push({
            title: 'Subscription Name',
            value: subscriptionName,
            short: false
        });
    }

    if (status) {
        fields.push({
            title: 'Status',
            value: status.charAt(0).toUpperCase() + status.slice(1),
            short: true
        });
    }

    return await sendSlackNotification({
        title: 'Subscription Created',
        text: `A new subscription has been created through Authorize.net`,
        fields,
        color: '#36a64f', // Green for subscription
        emoji: '🔄'
    });
}

/**
 * Formats a number as currency
 * 
 * @param {number|string} amount - Amount to format
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = 'USD') {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!Number.isFinite(numAmount)) {
        return '$0.00';
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(numAmount);
}




