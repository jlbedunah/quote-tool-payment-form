export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('Webhook received:', {
            headers: req.headers,
            body: req.body,
            timestamp: new Date().toISOString()
        });

        // Authorize.net webhook notifications
        if (req.body && req.body.eventType) {
            const { eventType, payload } = req.body;
            
            console.log(`Processing webhook event: ${eventType}`);
            
            // Handle different webhook event types
            switch (eventType) {
                case 'net.authorize.payment.authcapture.created':
                    console.log('Payment authorized and captured:', payload);
                    // Handle successful payment
                    break;
                    
                case 'net.authorize.payment.authcapture.failed':
                    console.log('Payment failed:', payload);
                    // Handle failed payment
                    break;
                    
                case 'net.authorize.payment.refund.created':
                    console.log('Refund created:', payload);
                    // Handle refund
                    break;
                    
                default:
                    console.log('Unknown webhook event type:', eventType);
            }
            
            // Always return 200 for successful webhook processing
            return res.status(200).json({ 
                success: true, 
                message: 'Webhook processed successfully',
                eventType: eventType,
                timestamp: new Date().toISOString()
            });
        }

        // Handle other webhook formats or test requests
        console.log('Webhook received (unknown format):', req.body);
        
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
