import { syncAuthorizeNetTransaction } from '../lib/authorize-net-sync.js';

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const eventBody = normalizeRequestBody(req.body);

        console.log('Webhook received:', {
            headers: req.headers,
            body: eventBody,
            eventType: eventBody?.eventType,
            timestamp: new Date().toISOString()
        });
        
        // Log full webhook payload for debugging (first 1000 chars)
        console.log('Webhook payload (first 1000 chars):', JSON.stringify(eventBody).substring(0, 1000));

        // Authorize.net webhook notifications
        if (eventBody && eventBody.eventType) {
            const { eventType } = eventBody;

            console.log(`Processing webhook event: ${eventType}`);

            let synchronizationResult = null;

            // Handle payment transaction events
            if (eventType.startsWith('net.authorize.payment.')) {
                switch (eventType) {
                    case 'net.authorize.payment.authcapture.created':
                        console.log('Calling syncAuthorizeNetTransaction for payment webhook...');
                        synchronizationResult = await syncAuthorizeNetTransaction(eventBody);
                        console.log('Synchronization result:', JSON.stringify(synchronizationResult, null, 2));
                        if (synchronizationResult?.quoteUpdate) {
                            console.log('Quote update result:', synchronizationResult.quoteUpdate);
                        } else {
                            console.log('No quote update in synchronization result');
                        }
                        break;

                    case 'net.authorize.payment.authcapture.failed':
                        console.log('Payment failed (no CRM sync attempted).');
                        break;

                    case 'net.authorize.payment.refund.created':
                        console.log('Refund created:', eventBody.payload);
                        break;

                    default:
                        console.log('Unknown payment event type:', eventType);
                }
            }
            // Unknown event type - log for debugging
            else {
                console.log('Unknown webhook event type:', eventType);
                console.log('Full event body:', JSON.stringify(eventBody, null, 2));
                // Log unknown events so you can see what Authorize.net is sending
            }

            // Always return 200 for successful webhook processing
            return res.status(200).json({
                success: true,
                message: 'Webhook processed successfully',
                eventType,
                synchronizationResult,
                timestamp: new Date().toISOString()
            });
        }

        // Handle other webhook formats or test requests
        console.log('Webhook received (unknown format):', eventBody);

        // Return 200 to acknowledge receipt
        return res.status(200).json({
            success: true,
            message: 'Webhook received and acknowledged',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Webhook processing error:', error);

        // Even on error, return 200 to prevent webhook retries
        // Log the error for debugging but don't fail the webhook
        return res.status(200).json({
            success: false,
            error: 'Webhook processed with errors',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

function normalizeRequestBody(body) {
    if (!body) {
        return {};
    }

    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch (parseError) {
            console.warn('Failed to parse string webhook body as JSON. Returning raw string.');
            return { rawBody: body };
        }
    }

    return body;
}
