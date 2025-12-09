import { findOrCreateContact, appendNoteToContact, addTagsToContact, removeTagsFromContact } from './gohighlevel.js';
import { buildAuthorizeNetConfigPriority } from './authorize-net-env.js';
import { supabase } from './supabase.js';
import { sendGA4PurchaseEvent } from './ga4-measurement-protocol.js';
import { notifySaleMade, notifySubscriptionCreated } from './slack-notifications.js';
import nodeFetch from 'node-fetch';

// Import logger - wrap in try/catch to handle potential import issues
import * as loggerModule from './logger.js';
const { logError: _logError, logWarn: _logWarn, logInfo: _logInfo } = loggerModule;

// Wrap logger functions to handle any runtime errors gracefully
const logError = async (source, message, metadata, error) => {
    try {
        await _logError(source, message, metadata, error);
    } catch (loggerErr) {
        // Fallback to console if logger fails - don't break the sync
        console.error(`[ERROR] ${source}:`, message, metadata, error);
    }
};

const logWarn = async (source, message, metadata) => {
    try {
        await _logWarn(source, message, metadata);
    } catch (loggerErr) {
        console.warn(`[WARN] ${source}:`, message, metadata);
    }
};

const logInfo = async (source, message, metadata) => {
    try {
        await _logInfo(source, message, metadata);
    } catch (loggerErr) {
        console.log(`[INFO] ${source}:`, message, metadata);
    }
};

let cachedFetchInstance = typeof fetch === 'function' ? fetch.bind(globalThis) : null;
let cachedXmlBuilder = null;
let cachedXmlParser = null;

export async function syncAuthorizeNetTransaction(eventBody) {
    if (!eventBody || eventBody.eventType !== 'net.authorize.payment.authcapture.created') {
        console.log('syncAuthorizeNetTransaction called with unsupported event type. Skipping.');
        return { skipped: true, reason: 'Unsupported event type' };
    }

    const normalized = normalizeAuthorizeNetPayload(eventBody);
    
    // Log sync start
    await logInfo(
        'lib/authorize-net-sync.js',
        'Starting Authorize.net transaction sync',
        {
            transactionId: normalized.transactionId,
            email: normalized.email,
            amount: normalized.amount,
            invoiceNumber: normalized.invoiceNumber,
            lineItemsCount: normalized.lineItems.length
        }
    );

    // Debug logging for product name extraction
    console.log('Normalized payload summary:', {
        primaryProductName: normalized.primaryProductName,
        lineItemsCount: normalized.lineItems.length,
        lineItemNames: normalized.lineItems.map(item => item.name),
        hasOrderDescription: !!eventBody?.payload?.order?.description,
        tags: normalized.tags,
        email: normalized.email
    });

    if (!normalized.email) {
        try {
            const details = await fetchAuthorizeNetTransactionDetails(eventBody.payload?.id);
            if (details) {
                if (!normalized.email && details?.customer?.email) {
                    normalized.email = details.customer.email;
                }
                normalized.customer.firstName = normalized.customer.firstName || details?.customer?.firstName || '';
                normalized.customer.lastName = normalized.customer.lastName || details?.customer?.lastName || '';
                normalized.customer.company = normalized.customer.company || details?.customer?.company || '';
                normalized.customer.phone = normalized.customer.phone || details?.customer?.phoneNumber || '';
                normalized.customer.address = normalized.customer.address || normalizeBilling(details?.billTo);
                normalized.billing = Object.keys(normalized.billing || {}).length > 0 ? normalized.billing : normalizeBilling(details?.billTo);
                normalized.shipping = Object.keys(normalized.shipping || {}).length > 0 ? normalized.shipping : normalizeShipping(details?.shipTo);
            }
        } catch (error) {
            console.warn('Failed to fetch Authorize.net transaction details for missing email:', error);
        }
    }

    // Send Slack notification for sale made - do this BEFORE early return
    // so we notify even if email is missing
    try {
        console.log('Preparing Slack notification for sale:', {
            hasEmail: !!normalized.email,
            transactionId: normalized.transactionId,
            amount: normalized.amount,
            lineItemsCount: normalized.lineItems.length
        });

        const customerName = normalized.customer.firstName && normalized.customer.lastName
            ? `${normalized.customer.firstName} ${normalized.customer.lastName}`
            : normalized.customer.firstName || normalized.customer.lastName || null;
        
        const slackResult = await notifySaleMade({
            customerName,
            customerEmail: normalized.email || 'No email provided',
            amount: normalized.amount,
            transactionId: normalized.transactionId,
            invoiceNumber: normalized.invoiceNumber,
            items: normalized.lineItems.map(item => ({
                name: item.name,
                productName: item.name,
                quantity: item.quantity,
                price: item.unitPrice,
                unitPrice: item.unitPrice
            })),
            currency: normalized.currencyCode
        });
        
        if (slackResult.success) {
            console.log('✅ Slack notification sent successfully for sale:', normalized.transactionId);
        } else if (slackResult.skipped) {
            console.log('⚠️ Slack notification skipped:', slackResult.reason);
        } else {
            await logError(
                'lib/authorize-net-sync.js',
                'Slack notification failed for sale',
                {
                    transactionId: normalized.transactionId,
                    email: normalized.email,
                    amount: normalized.amount
                },
                new Error(slackResult.error || 'Unknown error')
            );
        }
    } catch (slackError) {
        await logError(
            'lib/authorize-net-sync.js',
            'Error sending Slack notification (non-fatal)',
            {
                transactionId: normalized.transactionId,
                email: normalized.email
            },
            slackError
        );
        // Don't fail the whole sync if Slack notification fails
    }

    if (!normalized.email) {
        await logWarn(
            'lib/authorize-net-sync.js',
            'Authorize.net webhook missing customer email after detail lookup. Skipping CRM sync.',
            {
                transactionId: normalized.transactionId,
                invoiceNumber: normalized.invoiceNumber,
                amount: normalized.amount
            }
        );
        return { skipped: true, reason: 'Missing customer email', normalized };
    }

    // Ensure tags array exists and has the required tags
    if (!normalized.tags || !Array.isArray(normalized.tags)) {
        console.warn('⚠️ Tags array is missing or invalid, creating default tags:', {
            tags: normalized.tags,
            email: normalized.email
        });
        normalized.tags = ['authorize.net', 'sold bookkeeping project'];
    } else if (normalized.tags.length === 0) {
        console.warn('⚠️ Tags array is empty, adding default tags:', {
            email: normalized.email
        });
        normalized.tags = ['authorize.net', 'sold bookkeeping project'];
    } else {
        // Ensure required tags are present
        const requiredTags = ['authorize.net', 'sold bookkeeping project'];
        requiredTags.forEach(tag => {
            if (!normalized.tags.includes(tag)) {
                console.warn(`⚠️ Missing required tag "${tag}", adding it:`, {
                    email: normalized.email,
                    currentTags: normalized.tags
                });
                normalized.tags.push(tag);
            }
        });
    }

    console.log('Creating/finding GHL contact with tags:', {
        email: normalized.email,
        tags: normalized.tags,
        tagsCount: normalized.tags.length
    });

    let contact;
    let contactId;
    
    try {
        contact = await findOrCreateContact({
            email: normalized.email,
            firstName: normalized.customer.firstName,
            lastName: normalized.customer.lastName,
            phone: normalized.customer.phone,
            company: normalized.customer.company,
            address: normalized.customer.address,
            shippingAddress: normalized.shipping,
            billingAddress: normalized.billing,
            tags: normalized.tags
        });
        
        console.log('findOrCreateContact response:', {
            hasContact: !!contact,
            contactKeys: contact ? Object.keys(contact) : [],
            contactId: contact?.id,
            contactEmail: contact?.email,
            fullResponse: JSON.stringify(contact).substring(0, 500)
        });
        
        contactId = resolveContactId(contact);
        
        // Log contact creation/found
        await logInfo(
            'lib/authorize-net-sync.js',
            'GHL contact found/created',
            {
                contactId,
                email: normalized.email,
                transactionId: normalized.transactionId,
                wasCreated: contact?.created || false,
                contactResponse: contact ? {
                    hasId: !!contact.id,
                    hasContact: !!contact.contact,
                    hasContactsArray: Array.isArray(contact.contacts)
                } : null
            }
        );
        
        if (!contactId) {
            // Log detailed error about missing contact ID
            await logError(
                'lib/authorize-net-sync.js',
                'Unable to determine GoHighLevel contact ID from response',
                {
                    email: normalized.email,
                    transactionId: normalized.transactionId,
                    contactResponse: contact ? JSON.stringify(contact).substring(0, 1000) : 'null',
                    contactType: typeof contact,
                    contactKeys: contact ? Object.keys(contact) : []
                },
                new Error('Contact ID not found in response')
            );
            
            throw new Error('Unable to determine GoHighLevel contact ID from response');
        }
    } catch (contactError) {
        // Log the error with full context
        await logError(
            'lib/authorize-net-sync.js',
            'Failed to find or create GHL contact',
            {
                email: normalized.email,
                transactionId: normalized.transactionId,
                errorMessage: contactError.message,
                errorStatus: contactError.status,
                errorUrl: contactError.url,
                errorResponseBody: contactError.responseBody
            },
            contactError
        );
        
        // Re-throw to fail the sync - contact creation is critical
        throw contactError;
    }

    console.log('Preparing to append note to GHL contact:', {
        contactId,
        transactionId: normalized.transactionId,
        email: normalized.email,
        hasNoteBody: true
    });

    // Append note to contact with error handling
    try {
        const noteBody = buildNoteBody(normalized);
        console.log('Note body prepared (first 200 chars):', noteBody.substring(0, 200));
        
        const noteResult = await appendNoteToContact(contactId, noteBody);
        console.log('✅ Note appended to GHL contact successfully:', {
            contactId,
            transactionId: normalized.transactionId,
            email: normalized.email,
            noteResult: noteResult ? 'Note created' : 'No response'
        });
        
        await logInfo(
            'lib/authorize-net-sync.js',
            'Note appended to GHL contact',
            {
                contactId,
                transactionId: normalized.transactionId,
                email: normalized.email
            }
        );
    } catch (noteError) {
        await logError(
            'lib/authorize-net-sync.js',
            'Failed to append note to GHL contact',
            {
                contactId,
                transactionId: normalized.transactionId,
                email: normalized.email,
                invoiceNumber: normalized.invoiceNumber,
                amount: normalized.amount
            },
            noteError
        );
        // Don't fail the whole sync if note appending fails
        // Continue with tags and other operations
    }

    // Add tags with error handling
    // CRITICAL: Always add tags - this is a core feature
    if (normalized.tags && normalized.tags.length > 0) {
        try {
            console.log('Attempting to add tags to GHL contact:', {
                contactId,
                tags: normalized.tags,
                tagsCount: normalized.tags.length,
                email: normalized.email,
                transactionId: normalized.transactionId
            });
            
            await addTagsToContact(contactId, normalized.tags);
            
            console.log('✅ Tags added to GHL contact successfully:', {
                contactId,
                tags: normalized.tags,
                email: normalized.email
            });
            
            await logInfo(
                'lib/authorize-net-sync.js',
                'Tags added to GHL contact',
                {
                    contactId,
                    tags: normalized.tags,
                    email: normalized.email,
                    transactionId: normalized.transactionId
                }
            );
        } catch (tagError) {
            // Log error but don't fail the whole sync
            console.error('❌ CRITICAL: Failed to add tags to GHL contact:', {
                contactId,
                tags: normalized.tags,
                transactionId: normalized.transactionId,
                email: normalized.email,
                error: tagError.message,
                stack: tagError.stack
            });
            
            try {
                await logError(
                    'lib/authorize-net-sync.js',
                    'Failed to add tags to GHL contact',
                    {
                        contactId,
                        tags: normalized.tags,
                        transactionId: normalized.transactionId,
                        email: normalized.email
                    },
                    tagError
                );
            } catch (logErr) {
                // Even if logging fails, we've already logged to console
                console.error('Failed to log tag error:', logErr);
            }
            // Don't fail the whole sync if tag addition fails
        }
    } else {
        console.warn('⚠️ No tags to add to GHL contact:', {
            contactId,
            email: normalized.email,
            transactionId: normalized.transactionId,
            tagsArray: normalized.tags,
            tagsLength: normalized.tags?.length
        });
    }

    console.log('Skipped GoHighLevel custom field and opportunity updates (handled via workflow).');

    // Update quote payment status in database
    let quoteUpdateResult = null;
    console.log('Checking if quote update is needed:', {
        hasSupabase: !!supabase,
        hasEmail: !!normalized.email,
        email: normalized.email
    });
    
    if (supabase && normalized.email) {
        try {
            console.log('Attempting to update quote payment status for email:', normalized.email);
            quoteUpdateResult = await updateQuotePaymentStatus(normalized);
            if (quoteUpdateResult && quoteUpdateResult.success) {
                console.log('Quote payment status updated successfully:', quoteUpdateResult);
                
                await logInfo(
                    'lib/authorize-net-sync.js',
                    'Quote payment status updated',
                    {
                        email: normalized.email,
                        transactionId: normalized.transactionId,
                        quoteId: quoteUpdateResult.quoteId
                    }
                );
                
                // Add "quote-paid" tag to contact when quote is marked as paid
                if (contactId) {
                    try {
                        await addTagsToContact(contactId, ['quote-paid']);
                        console.log('Added "quote-paid" tag to contact:', contactId);
                    } catch (tagError) {
                        console.error('Error adding quote-paid tag to contact:', tagError);
                        // Don't fail the whole sync if tag addition fails
                    }
                }
            } else {
                console.log('Quote update returned null - no quote found or already updated');
            }
        } catch (error) {
            await logError(
                'lib/authorize-net-sync.js',
                'Error updating quote payment status',
                {
                    email: normalized.email,
                    transactionId: normalized.transactionId,
                    amount: normalized.amount
                },
                error
            );
            // Don't fail the whole sync if quote update fails
        }
    } else {
        console.log('Skipping quote update - missing supabase or email:', {
            hasSupabase: !!supabase,
            hasEmail: !!normalized.email
        });
    }

    // Send GA4 purchase event for all Authorize.net transactions
    // This ensures transactions outside the quote tool are also tracked
    try {
        const ga4Result = await sendGA4PurchaseEvent({
            transactionId: normalized.transactionId,
            amount: normalized.amount,
            currency: normalized.currencyCode,
            email: normalized.email,
            invoiceNumber: normalized.invoiceNumber,
            items: normalized.lineItems.map(item => ({
                itemId: item.itemId,
                id: item.itemId,
                name: item.name,
                productName: item.name,
                category: 'Bookkeeping Services',
                quantity: item.quantity,
                price: item.unitPrice,
                unitPrice: item.unitPrice
            }))
        });
        
        if (ga4Result.success) {
            console.log('GA4 purchase event sent successfully for transaction:', normalized.transactionId);
        } else if (ga4Result.skipped) {
            console.log('GA4 purchase event skipped:', ga4Result.reason);
        } else {
            console.warn('GA4 purchase event failed:', ga4Result.error || ga4Result);
        }
    } catch (ga4Error) {
        await logError(
            'lib/authorize-net-sync.js',
            'Error sending GA4 purchase event (non-fatal)',
            {
                transactionId: normalized.transactionId,
                email: normalized.email,
                amount: normalized.amount
            },
            ga4Error
        );
        // Don't fail the whole sync if GA4 tracking fails
    }

    // Log successful sync completion
    await logInfo(
        'lib/authorize-net-sync.js',
        'Authorize.net transaction sync completed successfully',
        {
            transactionId: normalized.transactionId,
            email: normalized.email,
            contactId,
            amount: normalized.amount,
            invoiceNumber: normalized.invoiceNumber,
            tagsAdded: normalized.tags?.length || 0,
            quoteUpdated: !!quoteUpdateResult?.success
        }
    );

    return {
        contactId,
        normalized,
        quoteUpdate: quoteUpdateResult
    };
}

/**
 * Update quote payment status when payment is processed
 */
async function updateQuotePaymentStatus(normalized) {
    if (!supabase || !normalized.email) {
        console.log('updateQuotePaymentStatus: Missing supabase or email', {
            hasSupabase: !!supabase,
            hasEmail: !!normalized.email
        });
        return null;
    }

    try {
        // Find quote by customer email (most recent pending quote)
        // We'll match by email (case-insensitive) and look for pending quotes
        const emailToMatch = normalized.email.toLowerCase().trim();
        console.log('updateQuotePaymentStatus: Searching for quote with email:', emailToMatch);
        
        // Fetch pending quotes and filter by email (case-insensitive)
        // Note: We fetch a few recent ones to handle case sensitivity
        // Also check for quotes that might not have payment_status set yet
        const { data: allPendingQuotes, error: findError } = await supabase
            .from('quotes')
            .select('id, customer_email, payment_status, payment_transaction_id, created_at, quote_number')
            .or('payment_status.eq.pending,payment_status.is.null')
            .order('created_at', { ascending: false })
            .limit(20); // Get more recent quotes to filter by email
        
        if (findError) {
            console.error('Error finding quote:', findError);
            return null;
        }

        console.log('updateQuotePaymentStatus: Found pending quotes:', {
            count: allPendingQuotes?.length || 0,
            emails: allPendingQuotes?.map(q => q.customer_email) || []
        });

        // Filter by email (case-insensitive) and get the most recent match
        const quotes = (allPendingQuotes || []).filter(quote => 
            quote.customer_email && 
            quote.customer_email.toLowerCase().trim() === emailToMatch
        );

        console.log('updateQuotePaymentStatus: Matching quotes after email filter:', {
            count: quotes?.length || 0,
            quoteIds: quotes?.map(q => q.id) || []
        });

        if (!quotes || quotes.length === 0) {
            console.log('No pending quote found for email:', normalized.email);
            console.log('Searched in pending quotes:', allPendingQuotes?.map(q => ({
                id: q.id,
                email: q.customer_email,
                status: q.payment_status
            })) || []);
            return null;
        }

        const quote = quotes[0];

        // If quote already has this transaction ID, skip update
        if (quote.payment_transaction_id === normalized.transactionId) {
            console.log('Quote already updated with this transaction ID');
            return { alreadyUpdated: true, quoteId: quote.id };
        }

        // Update quote with payment information
        const updateData = {
            payment_status: 'paid',
            payment_transaction_id: normalized.transactionId,
            payment_paid_at: normalized.saleDate || new Date().toISOString(),
            payment_amount: normalized.amount,
            payment_method: 'credit_card', // Default, could be enhanced
            status: 'paid' // Update main status as well
        };

        const { data: updatedQuote, error: updateError } = await supabase
            .from('quotes')
            .update(updateData)
            .eq('id', quote.id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating quote payment status:', updateError);
            return null;
        }

        console.log('Quote payment status updated successfully:', {
            quoteId: updatedQuote.id,
            transactionId: normalized.transactionId,
            amount: normalized.amount
        });

        return {
            success: true,
            quoteId: updatedQuote.id,
            transactionId: normalized.transactionId
        };

    } catch (error) {
        console.error('Error in updateQuotePaymentStatus:', error);
        return null;
    }
}

function normalizeAuthorizeNetPayload(eventBody) {
    const payload = eventBody?.payload || {};

    const lineItems = normalizeLineItems(payload.order?.lineItems || payload.lineItems);
    // Prioritize line item names over order description to get actual product names
    const primaryProductName = (lineItems[0]?.name) || payload.order?.description || 'Authorize.net Sale';

    const submitTimeUTC = payload.submitTimeUTC || payload.submitTimeLocal || eventBody.eventDate;
    const saleDate = submitTimeUTC ? new Date(submitTimeUTC).toISOString() : new Date().toISOString();

    return {
        eventId: eventBody.id,
        eventType: eventBody.eventType,
        saleDate,
        transactionId: payload.id || payload.transId || payload.transactionId || payload.transaction?.transId || null,
        authCode: payload.authCode || payload.authCodeText || null,
        amount: safeCurrencyParse(payload.authAmount ?? payload.settleAmount ?? payload.subscriptionAmount ?? payload.order?.amount ?? 0),
        currencyCode: payload.currencyCode || 'USD',
        invoiceNumber: payload.order?.invoiceNumber || payload.invoiceNumber || null,
        email: payload.customer?.email || payload.billTo?.email || payload.shipTo?.email || null,
        customer: {
            firstName: payload.customer?.firstName || payload.billTo?.firstName || payload.shipTo?.firstName || '',
            lastName: payload.customer?.lastName || payload.billTo?.lastName || payload.shipTo?.lastName || '',
            company: payload.customer?.company || payload.billTo?.company || payload.shipTo?.company || '',
            phone: payload.customer?.phoneNumber || payload.billTo?.phoneNumber || payload.shipTo?.phoneNumber || '',
            address: {
                line1: payload.billTo?.address || '',
                city: payload.billTo?.city || '',
                state: payload.billTo?.state || '',
                postalCode: payload.billTo?.zip || '',
                country: payload.billTo?.country || 'US'
            }
        },
        shipping: normalizeShipping(payload.shipTo),
        billing: normalizeBilling(payload.billTo),
        primaryProductName,
        productNames: lineItems.map(item => item.name).filter(Boolean),
        lineItems,
        tags: buildProductTags(lineItems, primaryProductName),
        rawPayload: payload
    };
}

function normalizeLineItems(lineItemsData) {
    if (!lineItemsData) {
        return [];
    }

    const rawItems = Array.isArray(lineItemsData)
        ? lineItemsData
        : Array.isArray(lineItemsData.lineItem)
            ? lineItemsData.lineItem
            : lineItemsData.lineItem
                ? [lineItemsData.lineItem]
                : [lineItemsData];

    return rawItems
        .filter(Boolean)
        .map((item, index) => ({
            index,
            itemId: item.itemId || item.id || null,
            name: item.name || item.itemName || item.description || `Line Item ${index + 1}`,
            description: item.description || '',
            quantity: safeNumberParse(item.quantity, 1),
            unitPrice: safeCurrencyParse(item.unitPrice ?? item.price ?? 0),
            taxable: item.taxable === 'true' || item.taxable === true,
            totalAmount: safeCurrencyParse(item.totalAmount ?? item.unitPrice ?? 0)
        }));
}

function normalizeShipping(shipTo) {
    if (!shipTo) {
        return {};
    }

    return {
        firstName: shipTo.firstName || '',
        lastName: shipTo.lastName || '',
        company: shipTo.company || '',
        line1: shipTo.address || '',
        city: shipTo.city || '',
        state: shipTo.state || '',
        postalCode: shipTo.zip || '',
        country: shipTo.country || 'US',
        phone: shipTo.phoneNumber || ''
    };
}

function normalizeBilling(billTo) {
    if (!billTo) {
        return {};
    }

    return {
        firstName: billTo.firstName || '',
        lastName: billTo.lastName || '',
        company: billTo.company || '',
        line1: billTo.address || '',
        city: billTo.city || '',
        state: billTo.state || '',
        postalCode: billTo.zip || '',
        country: billTo.country || 'US',
        phone: billTo.phoneNumber || ''
    };
}

function buildProductTags(lineItems, primaryProductName) {
    const tags = new Set(['authorize.net', 'sold bookkeeping project']);

    console.log('buildProductTags called with:', {
        lineItemsCount: lineItems?.length || 0,
        lineItems: lineItems,
        primaryProductName: primaryProductName
    });

    if (primaryProductName) {
        const slugged = slugifyProductTag(primaryProductName);
        if (slugged) {
            tags.add(slugged);
            console.log('Added product tag from primaryProductName:', slugged);
        }
    }

    if (lineItems && Array.isArray(lineItems)) {
        lineItems.forEach(item => {
            if (item.name) {
                const slugged = slugifyProductTag(item.name);
                if (slugged) {
                    tags.add(slugged);
                    console.log('Added product tag from line item:', slugged);
                }
            }
        });
    }

    const finalTags = Array.from(tags).filter(Boolean);
    console.log('buildProductTags returning tags:', finalTags);
    
    return finalTags;
}

function slugifyProductTag(name) {
    if (!name) {
        return null;
    }

    return name
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function buildNoteBody(normalized) {
    const lines = [
        'External Sale (Authorize.net)',
        `Amount: ${formatCurrency(normalized.amount, normalized.currencyCode)}`,
        normalized.transactionId ? `Transaction ID: ${normalized.transactionId}` : null,
        normalized.invoiceNumber ? `Invoice: ${normalized.invoiceNumber}` : null,
        normalized.primaryProductName ? `Product: ${normalized.primaryProductName}` : null,
        normalized.saleDate ? `Sale Date: ${normalized.saleDate}` : null
    ].filter(Boolean);

    // Always show line items if available, with descriptions
    if (normalized.lineItems.length > 0) {
        lines.push('Line Items:');
        normalized.lineItems.forEach(item => {
            const itemLine = ` - ${item.name} (${formatCurrency(item.totalAmount || item.unitPrice, normalized.currencyCode)})`;
            if (item.description) {
                lines.push(itemLine);
                lines.push(`   Description: ${item.description}`);
            } else {
                lines.push(itemLine);
            }
        });
    }

    lines.push('', 'Raw Payload:', JSON.stringify(normalized.rawPayload));

    return lines.join('\n');
}

function resolveContactId(contactResponse) {
    if (!contactResponse) {
        return null;
    }

    if (contactResponse.id) {
        return contactResponse.id;
    }

    if (contactResponse.contact?.id) {
        return contactResponse.contact.id;
    }

    if (Array.isArray(contactResponse.contacts) && contactResponse.contacts.length > 0) {
        return contactResponse.contacts[0].id;
    }

    if (contactResponse.contactId) {
        return contactResponse.contactId;
    }

    return null;
}

function safeCurrencyParse(value) {
    if (value === null || value === undefined || value === '') {
        return 0;
    }

    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function safeNumberParse(value, fallback = 0) {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function formatCurrency(amount, currencyCode = 'USD') {
    const normalizedAmount = Number.isFinite(amount) ? amount : safeCurrencyParse(amount);
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode
    }).format(normalizedAmount);
}

async function fetchAuthorizeNetTransactionDetails(transId) {
    if (!transId) {
        return null;
    }

    const attempts = buildAuthorizeNetConfigPriority();

    for (const config of attempts) {
        if (!config.loginId || !config.transactionKey) {
            continue;
        }

        try {
            const builder = await getXmlBuilder();
            const parser = await getXmlParser();
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
            const response = await fetchWithFallback(config.endpoint, {
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
                    statusText: response.statusText,
                    environment: config.environment,
                    bodySnippet: text.slice(0, 200)
                });
                continue;
            }

            let parsed;
            try {
                parsed = parser.parse(text);
            } catch (error) {
                console.warn('Failed to parse Authorize.net transaction details XML', error);
                continue;
            }

            const transaction = parsed?.getTransactionDetailsResponse?.transaction;
            if (transaction) {
                console.log('Retrieved Authorize.net transaction details for missing email', {
                    environment: config.environment,
                    hasEmail: !!transaction?.customer?.email
                });
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

async function fetchWithFallback(url, options) {
    if (!cachedFetchInstance) {
        cachedFetchInstance = nodeFetch;
    }
    return cachedFetchInstance(url, options);
}

async function getXmlBuilder() {
    if (!cachedXmlBuilder) {
        const fastXml = await import('fast-xml-parser');
        cachedXmlBuilder = fastXml.XMLBuilder;
    }
    return new cachedXmlBuilder({ ignoreAttributes: false });
}

async function getXmlParser() {
    if (!cachedXmlParser) {
        const fastXml = await import('fast-xml-parser');
        cachedXmlParser = new fastXml.XMLParser({
            ignoreAttributes: false,
            parseTagValue: true,
            parseNodeValue: true,
            trimValues: true,
            parseTrueNumberOnly: false
        });
    }
    return cachedXmlParser;
}

/**
 * Get product-specific subscription tags based on billing interval
 * Uses interval-only matching (not amount) since amounts can vary
 * 
 * @param {string} interval - Billing interval: 'monthly', 'quarterly', 'weekly', 'biweekly', 'annually'
 * @returns {string[]} Array of product-specific tags to add
 */
function getSubscriptionTagsByInterval(interval) {
    if (!interval) {
        return [];
    }

    // Normalize interval to lowercase for matching
    const normalizedInterval = String(interval).toLowerCase().trim();

    // Map intervals to product-specific tags
    // Assumes only ONE subscription product per interval
    const mapping = {
        'monthly': ['monthly-bookkeeping-subscription'],
        'quarterly': ['quarterly-bookkeeping-subscription'],
        'weekly': ['weekly-bookkeeping-subscription'],
        'biweekly': ['biweekly-bookkeeping-subscription'],
        'bi-weekly': ['biweekly-bookkeeping-subscription'], // Handle hyphenated variant
        'annually': ['annual-bookkeeping-subscription'],
        'annual': ['annual-bookkeeping-subscription'] // Handle variant
    };

    return mapping[normalizedInterval] || [];
}

/**
 * Sync subscription creation event from Authorize.net to GoHighLevel
 * - Find or create contact by email
 * - Tag with "subscription-created" and product-specific tag based on interval
 * - Add note with subscription details
 */
export async function syncAuthorizeNetSubscription(eventBody) {
    if (!eventBody || eventBody.eventType !== 'net.authorize.customer.subscription.created') {
        console.log('syncAuthorizeNetSubscription called with unsupported event type. Skipping.');
        return { skipped: true, reason: 'Unsupported event type' };
    }

    const payload = eventBody?.payload || {};
    const subscription = payload.subscription || payload;

    // Extract subscription details
    const subscriptionId = subscription.id || subscription.subscriptionId || null;
    const subscriptionName = subscription.name || subscription.subscriptionName || 'Subscription';
    const amount = safeCurrencyParse(subscription.amount || subscription.totalAmount || 0);
    const interval = subscription.interval || subscription.billingInterval || 'monthly';
    const startDate = subscription.startDate || subscription.createdAt || new Date().toISOString();
    const status = subscription.status || 'active';

    // Extract customer information
    const email = subscription.customer?.email || 
                  subscription.billTo?.email || 
                  subscription.profile?.email || 
                  null;
    
    const firstName = subscription.customer?.firstName || 
                      subscription.billTo?.firstName || 
                      subscription.profile?.firstName || 
                      '';
    
    const lastName = subscription.customer?.lastName || 
                     subscription.billTo?.lastName || 
                     subscription.profile?.lastName || 
                     '';
    
    const phone = subscription.customer?.phoneNumber || 
                  subscription.billTo?.phoneNumber || 
                  subscription.profile?.phone || 
                  '';
    
    const company = subscription.customer?.company || 
                    subscription.billTo?.company || 
                    subscription.profile?.company || 
                    '';

    if (!email) {
        await logWarn(
            'lib/authorize-net-sync.js',
            'Authorize.net subscription webhook missing customer email. Skipping CRM sync.',
            {
                subscriptionId,
                subscriptionName,
                amount,
                interval
            }
        );
        return { skipped: true, reason: 'Missing customer email', subscriptionId };
    }

    // Find or create contact
    const contact = await findOrCreateContact({
        email: email.toLowerCase(),
        firstName,
        lastName,
        phone,
        company
    });

    if (!contact || !contact.id) {
        throw new Error('Unable to determine GoHighLevel contact ID from response');
    }

    const contactId = contact.id;

    // Build note body
    const noteBody = `🔄 Subscription Created (Authorize.net)

Subscription ID: ${subscriptionId || 'N/A'}
Subscription Name: ${subscriptionName}
Amount: ${formatCurrency(amount)}
Billing Interval: ${interval}
Status: ${status}
Start Date: ${new Date(startDate).toLocaleString()}
Created: ${new Date().toLocaleString()}`;

    // Add note to contact
    await appendNoteToContact(contactId, noteBody);

    // Get product-specific tags based on interval
    const productTags = getSubscriptionTagsByInterval(interval);
    
    // Combine generic and product-specific tags
    const allTags = ['subscription-created', ...productTags];

    console.log('Adding subscription tags:', {
        interval,
        productTags,
        allTags
    });

    // Add tags
    await addTagsToContact(contactId, allTags);

    // Send Slack notification for subscription created
    try {
        const customerName = firstName && lastName
            ? `${firstName} ${lastName}`
            : firstName || lastName || null;

        const slackResult = await notifySubscriptionCreated({
            customerName,
            customerEmail: email,
            amount,
            subscriptionId,
            subscriptionName,
            interval,
            status
        });

        if (slackResult.success) {
            console.log('✅ Slack notification sent successfully for subscription:', subscriptionId);
        } else if (slackResult.skipped) {
            console.log('⚠️ Slack notification skipped:', slackResult.reason);
        } else {
            await logError(
                'lib/authorize-net-sync.js',
                'Slack notification failed for subscription',
                {
                    subscriptionId,
                    email,
                    amount,
                    interval
                },
                new Error(slackResult.error || 'Unknown error')
            );
        }
    } catch (slackError) {
        await logError(
            'lib/authorize-net-sync.js',
            'Error sending Slack notification for subscription (non-fatal)',
            {
                subscriptionId,
                email
            },
            slackError
        );
        // Don't fail the whole sync if Slack notification fails
    }

    console.log('Subscription synced to GHL:', {
        contactId,
        email,
        subscriptionId,
        subscriptionName,
        interval,
        tagsAdded: allTags
    });

    return {
        contactId,
        email,
        subscriptionId,
        subscriptionName
    };
}

/**
 * Sync subscription cancellation event from Authorize.net to GoHighLevel
 * - Find contact by email
 * - Remove active subscription tags (interval-based tags)
 * - Add "subscription-cancelled" tag
 * - Add note with cancellation details
 */
export async function syncAuthorizeNetSubscriptionCancellation(eventBody) {
    if (!eventBody || eventBody.eventType !== 'net.authorize.customer.subscription.cancelled') {
        console.log('syncAuthorizeNetSubscriptionCancellation called with unsupported event type. Skipping.');
        return { skipped: true, reason: 'Unsupported event type' };
    }

    const payload = eventBody?.payload || {};
    const subscription = payload.subscription || payload;

    // Extract subscription details
    const subscriptionId = subscription.id || subscription.subscriptionId || null;
    const subscriptionName = subscription.name || subscription.subscriptionName || 'Subscription';
    const amount = safeCurrencyParse(subscription.amount || subscription.totalAmount || 0);
    const interval = subscription.interval || subscription.billingInterval || null;
    const cancelledDate = subscription.cancelledDate || subscription.cancelDate || new Date().toISOString();
    const status = subscription.status || 'cancelled';

    // Extract customer information
    const email = subscription.customer?.email || 
                  subscription.billTo?.email || 
                  subscription.profile?.email || 
                  null;
    
    const firstName = subscription.customer?.firstName || 
                      subscription.billTo?.firstName || 
                      subscription.profile?.firstName || 
                      '';
    
    const lastName = subscription.customer?.lastName || 
                     subscription.billTo?.lastName || 
                     subscription.profile?.lastName || 
                     '';

    if (!email) {
        await logWarn(
            'lib/authorize-net-sync.js',
            'Authorize.net subscription cancellation webhook missing customer email. Skipping CRM sync.',
            {
                subscriptionId,
                subscriptionName,
                amount,
                interval
            }
        );
        return { skipped: true, reason: 'Missing customer email', subscriptionId };
    }

    // Log cancellation sync start
    await logInfo(
        'lib/authorize-net-sync.js',
        'Starting Authorize.net subscription cancellation sync',
        {
            subscriptionId,
            email,
            interval,
            amount
        }
    );

    // Find or create contact
    let contact;
    let contactId;
    
    try {
        contact = await findOrCreateContact({
            email: email.toLowerCase(),
            firstName,
            lastName
        });

        if (!contact || !contact.id) {
            throw new Error('Unable to determine GoHighLevel contact ID from response');
        }

        contactId = contact.id;
        
        await logInfo(
            'lib/authorize-net-sync.js',
            'GHL contact found/created for cancellation',
            {
                contactId,
                email,
                subscriptionId
            }
        );
    } catch (contactError) {
        await logError(
            'lib/authorize-net-sync.js',
            'Failed to find or create GHL contact for subscription cancellation',
            {
                email,
                subscriptionId,
                errorMessage: contactError.message
            },
            contactError
        );
        throw contactError;
    }

    // Build note body
    const noteBody = `❌ Subscription Cancelled (Authorize.net)

Subscription ID: ${subscriptionId || 'N/A'}
Subscription Name: ${subscriptionName}
Amount: ${formatCurrency(amount)}
Billing Interval: ${interval || 'N/A'}
Status: ${status}
Cancelled Date: ${new Date(cancelledDate).toLocaleString()}
Cancelled: ${new Date().toLocaleString()}`;

    // Add note to contact
    try {
        await appendNoteToContact(contactId, noteBody);
        await logInfo(
            'lib/authorize-net-sync.js',
            'Note appended for subscription cancellation',
            {
                contactId,
                email,
                subscriptionId
            }
        );
    } catch (noteError) {
        await logError(
            'lib/authorize-net-sync.js',
            'Failed to append note for subscription cancellation',
            {
                contactId,
                email,
                subscriptionId
            },
            noteError
        );
        // Don't fail the whole sync if note appending fails
    }

    // Remove active subscription tags based on interval
    const tagsToRemove = [];
    if (interval) {
        const intervalTags = getSubscriptionTagsByInterval(interval);
        tagsToRemove.push(...intervalTags);
    }
    // Also remove subscription-created tag
    tagsToRemove.push('subscription-created');

    // Remove tags if we have any to remove
    if (tagsToRemove.length > 0) {
        try {
            console.log('Removing subscription tags:', {
                contactId,
                tagsToRemove,
                email,
                subscriptionId
            });
            
            await removeTagsFromContact(contactId, tagsToRemove);
            
            await logInfo(
                'lib/authorize-net-sync.js',
                'Removed active subscription tags',
                {
                    contactId,
                    tagsRemoved: tagsToRemove,
                    email,
                    subscriptionId
                }
            );
        } catch (removeTagError) {
            await logError(
                'lib/authorize-net-sync.js',
                'Failed to remove subscription tags',
                {
                    contactId,
                    tagsToRemove,
                    email,
                    subscriptionId
                },
                removeTagError
            );
            // Don't fail the whole sync if tag removal fails
        }
    }

    // Add cancellation tag
    try {
        await addTagsToContact(contactId, ['subscription-cancelled']);
        
        await logInfo(
            'lib/authorize-net-sync.js',
            'Added subscription-cancelled tag',
            {
                contactId,
                email,
                subscriptionId
            }
        );
    } catch (tagError) {
        await logError(
            'lib/authorize-net-sync.js',
            'Failed to add subscription-cancelled tag',
            {
                contactId,
                email,
                subscriptionId
            },
            tagError
        );
        // Don't fail the whole sync if tag addition fails
    }

    // Log successful cancellation sync completion
    await logInfo(
        'lib/authorize-net-sync.js',
        'Authorize.net subscription cancellation sync completed successfully',
        {
            subscriptionId,
            email,
            contactId,
            interval,
            tagsRemoved: tagsToRemove,
            tagAdded: 'subscription-cancelled'
        }
    );

    return {
        contactId,
        email,
        subscriptionId,
        tagsRemoved: tagsToRemove,
        tagAdded: 'subscription-cancelled'
    };
}
