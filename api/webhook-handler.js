import { syncAuthorizeNetTransaction } from '../lib/authorize-net-sync.js';
import { syncAuthorizeNetSubscription, syncAuthorizeNetSubscriptionCancellation } from '../lib/authorize-net-sync.js';
import { logInfo, logError } from '../lib/logger.js';
import {
    handlePaymentPlanPayment,
    handlePaymentPlanSuspension,
    handlePaymentPlanCancellation
} from '../lib/payment-plan-utils.js';

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
        
        // Log webhook receipt to application logs
        await logInfo(
            'api/webhook-handler.js',
            'Authorize.net webhook received',
            {
                eventType: eventBody?.eventType,
                transactionId: eventBody?.payload?.id,
                email: eventBody?.payload?.customer?.email || eventBody?.payload?.billTo?.email,
                amount: eventBody?.payload?.authAmount || eventBody?.payload?.order?.amount
            }
        );
        
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
                        // First, check if this is a payment plan recurring payment
                        const subscriptionId = eventBody?.payload?.subscription?.id;
                        let paymentPlanResult = null;
                        if (subscriptionId) {
                            console.log('Checking if this payment is part of a payment plan...');
                            paymentPlanResult = await handlePaymentPlanPayment(eventBody);
                            if (paymentPlanResult && !paymentPlanResult.skipped) {
                                console.log('Payment plan payment processed:', JSON.stringify(paymentPlanResult, null, 2));
                            }
                        }

                        // Continue with regular transaction sync
                        console.log('Calling syncAuthorizeNetTransaction for payment webhook...');
                        synchronizationResult = await syncAuthorizeNetTransaction(eventBody);
                        console.log('Synchronization result:', JSON.stringify(synchronizationResult, null, 2));

                        // Add payment plan result to synchronization result
                        if (paymentPlanResult && !paymentPlanResult.skipped) {
                            synchronizationResult = {
                                ...synchronizationResult,
                                paymentPlanUpdate: paymentPlanResult
                            };
                        }

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
            // Handle subscription events
            else if (eventType.startsWith('net.authorize.customer.subscription.')) {
                switch (eventType) {
                    case 'net.authorize.customer.subscription.created':
                        console.log('Calling syncAuthorizeNetSubscription for subscription creation webhook...');
                        synchronizationResult = await syncAuthorizeNetSubscription(eventBody);
                        console.log('Subscription sync result:', JSON.stringify(synchronizationResult, null, 2));
                        break;

                    case 'net.authorize.customer.subscription.cancelled':
                        console.log('Calling syncAuthorizeNetSubscriptionCancellation for subscription cancellation webhook...');
                        // Check if this is a payment plan cancellation
                        const ppCancellationResult = await handlePaymentPlanCancellation(eventBody);
                        if (ppCancellationResult && !ppCancellationResult.skipped) {
                            console.log('Payment plan cancellation handled:', JSON.stringify(ppCancellationResult, null, 2));
                        }
                        // Continue with regular subscription cancellation sync
                        synchronizationResult = await syncAuthorizeNetSubscriptionCancellation(eventBody);
                        if (ppCancellationResult && !ppCancellationResult.skipped) {
                            synchronizationResult = {
                                ...synchronizationResult,
                                paymentPlanCancellation: ppCancellationResult
                            };
                        }
                        console.log('Subscription cancellation sync result:', JSON.stringify(synchronizationResult, null, 2));
                        break;

                    case 'net.authorize.customer.subscription.suspended':
                        console.log('Subscription suspended:', eventBody.payload);
                        // Check if this is a payment plan suspension
                        const suspensionResult = await handlePaymentPlanSuspension(eventBody);
                        if (suspensionResult && !suspensionResult.skipped) {
                            console.log('Payment plan suspension handled:', JSON.stringify(suspensionResult, null, 2));
                            synchronizationResult = { paymentPlanSuspension: suspensionResult };
                        }
                        break;

                    case 'net.authorize.customer.subscription.terminated':
                        console.log('Subscription terminated:', eventBody.payload);
                        // Check if this is a payment plan termination (treat like cancellation)
                        const terminationResult = await handlePaymentPlanCancellation(eventBody);
                        if (terminationResult && !terminationResult.skipped) {
                            console.log('Payment plan termination handled:', JSON.stringify(terminationResult, null, 2));
                            synchronizationResult = { paymentPlanTermination: terminationResult };
                        }
                        break;

                    default:
                        console.log('Unknown subscription event type:', eventType);
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
        
        // Log error to application logs
        await logError(
            'api/webhook-handler.js',
            'Error processing Authorize.net webhook',
            {
                eventType: req.body?.eventType,
                errorMessage: error.message
            },
            error
        );

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
