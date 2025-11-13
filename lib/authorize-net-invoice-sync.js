import { findOrCreateContact, appendNoteToContact, addTagsToContact } from './gohighlevel.js';
import { buildAuthorizeNetConfigPriority } from './authorize-net-env.js';
import nodeFetch from 'node-fetch';

let cachedFetchInstance = typeof fetch === 'function' ? fetch.bind(globalThis) : null;

// Use global cache for XML parser/builder to avoid redeclaration errors
let cachedXmlBuilder = null;
let cachedXmlParser = null;

async function getXmlBuilder() {
    if (globalThis.__FAST_XML_PARSER_LIB__) {
        return globalThis.__FAST_XML_PARSER_LIB__.XMLBuilder;
    }
    if (!cachedXmlBuilder) {
        const fastXml = await import('fast-xml-parser');
        cachedXmlBuilder = fastXml.XMLBuilder;
        if (!globalThis.__FAST_XML_PARSER_LIB__) {
            globalThis.__FAST_XML_PARSER_LIB__ = fastXml;
        }
    }
    return cachedXmlBuilder;
}

async function getXmlParser() {
    if (globalThis.__FAST_XML_PARSER_LIB__) {
        return globalThis.__FAST_XML_PARSER_LIB__.XMLParser;
    }
    if (!cachedXmlParser) {
        const fastXml = await import('fast-xml-parser');
        cachedXmlParser = fastXml.XMLParser;
        if (!globalThis.__FAST_XML_PARSER_LIB__) {
            globalThis.__FAST_XML_PARSER_LIB__ = fastXml;
        }
    }
    return cachedXmlParser;
}

/**
 * Sync Authorize.net invoice events to GoHighLevel
 * Handles: created, sent, paid, updated events
 */
export async function syncAuthorizeNetInvoice(eventBody) {
    if (!eventBody || !eventBody.eventType) {
        console.log('syncAuthorizeNetInvoice called with invalid event body. Skipping.');
        return { skipped: true, reason: 'Invalid event body' };
    }

    const eventType = eventBody.eventType;
    
    // Map event types to actions
    // Note: Authorize.net event types may vary - this handles common formats
    const eventTypeMap = {
        // Standard invoice event types
        'invoicing.customer.invoice.created': 'created',
        'invoicing.customer.invoice.send': 'sent',
        'invoicing.customer.invoice.paid': 'paid',
        'invoicing.customer.invoice.updated': 'updated',
        'invoicing.customer.invoice.partial-payment': 'partial-payment',
        'invoicing.customer.invoice.cancel': 'cancelled',
        'invoicing.customer.invoice.reminder': 'reminder',
        'invoicing.customer.invoice.overdue-reminder': 'overdue-reminder',
        // Alternative event type formats (if Authorize.net uses different format)
        'net.authorize.invoice.created': 'created',
        'net.authorize.invoice.sent': 'sent',
        'net.authorize.invoice.paid': 'paid',
        'net.authorize.invoice.updated': 'updated'
    };

    // Try to get action from explicit map first
    let action = eventTypeMap[eventType];
    
    // If not found, try to detect action from event type string (fallback)
    if (!action) {
        const eventTypeLower = eventType.toLowerCase();
        if (eventTypeLower.includes('created') || eventTypeLower.includes('create')) {
            action = 'created';
        } else if (eventTypeLower.includes('sent') || eventTypeLower.includes('send')) {
            action = 'sent';
        } else if (eventTypeLower.includes('paid') || eventTypeLower.includes('pay')) {
            action = 'paid';
        } else if (eventTypeLower.includes('updated') || eventTypeLower.includes('update')) {
            action = 'updated';
        } else if (eventTypeLower.includes('cancel')) {
            action = 'cancelled';
        } else if (eventTypeLower.includes('reminder') && eventTypeLower.includes('overdue')) {
            action = 'overdue-reminder';
        } else if (eventTypeLower.includes('reminder')) {
            action = 'reminder';
        } else if (eventTypeLower.includes('partial')) {
            action = 'partial-payment';
        }
    }
    
    if (!action) {
        console.log(`syncAuthorizeNetInvoice called with unsupported event type: ${eventType}. Skipping.`);
        console.log('Full event body:', JSON.stringify(eventBody, null, 2));
        return { skipped: true, reason: 'Unsupported event type', eventType };
    }

    const normalized = normalizeAuthorizeNetInvoicePayload(eventBody, action);

    // Debug logging
    console.log('Normalized invoice payload summary:', {
        eventType,
        action,
        invoiceId: normalized.invoiceId,
        invoiceNumber: normalized.invoiceNumber,
        customerEmail: normalized.email,
        amount: normalized.amount,
        status: normalized.status
    });

    // Fetch invoice details if email is missing (fallback)
    // Note: Most webhook payloads should include customer email
    // This is a fallback in case the webhook payload is incomplete
    if (!normalized.email && normalized.invoiceId) {
        console.log('Invoice webhook missing email, attempting to fetch invoice details...');
        try {
            const details = await fetchAuthorizeNetInvoiceDetails(normalized.invoiceId);
            if (details) {
                // Extract customer email from fetched details
                const fetchedEmail = details?.customer?.email || 
                                   details?.billTo?.email || 
                                   details?.email || 
                                   null;
                
                if (fetchedEmail && !normalized.email) {
                    normalized.email = fetchedEmail;
                    console.log('Retrieved email from invoice details:', fetchedEmail);
                }
                
                // Merge additional customer data if missing
                if (!normalized.customer.firstName && details?.customer?.firstName) {
                    normalized.customer.firstName = details.customer.firstName;
                }
                if (!normalized.customer.lastName && details?.customer?.lastName) {
                    normalized.customer.lastName = details.customer.lastName;
                }
                if (!normalized.customer.company && details?.customer?.company) {
                    normalized.customer.company = details.customer.company;
                }
                if (!normalized.customer.phone && details?.customer?.phoneNumber) {
                    normalized.customer.phone = details.customer.phoneNumber;
                }
                
                // Merge invoice data if missing
                if (!normalized.amount && details?.amount) {
                    normalized.amount = safeCurrencyParse(details.amount);
                }
                if (!normalized.invoiceNumber && details?.invoiceNumber) {
                    normalized.invoiceNumber = details.invoiceNumber;
                }
                if (!normalized.status && details?.status) {
                    normalized.status = details.status;
                }
            }
        } catch (error) {
            console.warn('Failed to fetch Authorize.net invoice details (this is OK if webhook has all data):', error.message);
            // Continue with webhook payload data - this is expected if invoice API is not available
        }
    }

    if (!normalized.email) {
        console.warn('Authorize.net invoice webhook missing customer email. Skipping CRM sync.', {
            normalizedSummary: {
                invoiceId: normalized.invoiceId,
                invoiceNumber: normalized.invoiceNumber,
                amount: normalized.amount,
                action
            }
        });
        return { skipped: true, reason: 'Missing customer email', normalized };
    }

    // Create/update contact in GHL
    const contact = await findOrCreateContact({
        email: normalized.email,
        firstName: normalized.customer.firstName,
        lastName: normalized.customer.lastName,
        phone: normalized.customer.phone,
        company: normalized.customer.company,
        address: normalized.customer.address,
        tags: normalized.tags
    });

    const contactId = resolveContactId(contact);

    if (!contactId) {
        throw new Error('Unable to determine GoHighLevel contact ID from response');
    }

    // Add note about invoice event
    const noteBody = buildInvoiceNoteBody(normalized, action);
    await appendNoteToContact(contactId, noteBody);

    // Add tags
    if (normalized.tags.length > 0) {
        await addTagsToContact(contactId, normalized.tags);
    }

    console.log('Invoice event synced to GoHighLevel:', {
        contactId,
        action,
        invoiceId: normalized.invoiceId,
        invoiceNumber: normalized.invoiceNumber
    });

    return {
        contactId,
        action,
        normalized
    };
}

/**
 * Normalize Authorize.net invoice webhook payload
 * Note: Authorize.net invoice webhook payload structure may vary
 * This function handles multiple possible payload structures
 */
function normalizeAuthorizeNetInvoicePayload(eventBody, action) {
    const payload = eventBody?.payload || {};
    
    // Invoice data can be at different levels in the payload
    // Try multiple paths to find invoice data
    const invoice = payload.invoice || 
                    payload.data?.invoice || 
                    payload.data || 
                    payload;

    // Extract line items if available (multiple possible structures)
    const lineItemsData = invoice.lineItems || 
                         invoice.items || 
                         invoice.lineItem || 
                         payload.lineItems || 
                         payload.items || 
                         [];
    
    const lineItems = normalizeInvoiceLineItems(lineItemsData);
    const primaryProductName = lineItems[0]?.name || 
                               invoice.description || 
                               invoice.name || 
                               payload.description || 
                               'Invoice';

    // Extract dates (multiple possible fields)
    const eventDate = eventBody.eventDate || 
                     payload.eventDate || 
                     eventBody.timestamp || 
                     payload.timestamp || 
                     new Date().toISOString();
    
    const invoiceDate = invoice.invoiceDate || 
                       invoice.date || 
                       invoice.createdDate || 
                       invoice.issueDate || 
                       eventDate;
    
    const dueDate = invoice.dueDate || 
                   invoice.dueDate || 
                   invoice.paymentDueDate || 
                   null;

    // Extract customer information (multiple possible structures)
    const customer = invoice.customer || 
                    payload.customer || 
                    invoice.billTo || 
                    payload.billTo || 
                    {};
    
    const billTo = invoice.billTo || 
                  payload.billTo || 
                  invoice.billing || 
                  payload.billing || 
                  {};

    // Extract amount (multiple possible fields)
    const amount = safeCurrencyParse(
        invoice.amount ||
        invoice.totalAmount ||
        invoice.total ||
        invoice.invoiceAmount ||
        payload.amount ||
        payload.totalAmount ||
        0
    );

    // Extract invoice status
    const status = invoice.status || 
                  payload.status || 
                  invoice.invoiceStatus || 
                  action;

    // Extract invoice ID and number (multiple possible fields)
    const invoiceId = invoice.id || 
                     invoice.invoiceId || 
                     invoice.invoiceID || 
                     payload.id || 
                     payload.invoiceId || 
                     null;
    
    const invoiceNumber = invoice.invoiceNumber || 
                         invoice.number || 
                         invoice.invoiceNum || 
                         payload.invoiceNumber || 
                         payload.invoiceNumber || 
                         null;

    // Extract email (multiple possible locations)
    const email = customer.email || 
                 billTo.email || 
                 invoice.email || 
                 payload.email || 
                 customer.customerEmail || 
                 null;

    // Build tags based on action and products
    const tags = buildInvoiceTags(lineItems, primaryProductName, action, status);

    return {
        eventId: eventBody.id,
        eventType: eventBody.eventType,
        action,
        invoiceId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        amount,
        currencyCode: invoice.currencyCode || 
                     payload.currencyCode || 
                     invoice.currency || 
                     'USD',
        status,
        email,
        customer: {
            firstName: customer.firstName || 
                      billTo.firstName || 
                      customer.first || 
                      '',
            lastName: customer.lastName || 
                     billTo.lastName || 
                     customer.last || 
                     '',
            company: customer.company || 
                    billTo.company || 
                    customer.companyName || 
                    '',
            phone: customer.phoneNumber || 
                  customer.phone || 
                  billTo.phoneNumber || 
                  billTo.phone || 
                  customer.phoneNumber || 
                  '',
            address: {
                line1: billTo.address || 
                      billTo.address1 || 
                      billTo.line1 || 
                      customer.address || 
                      '',
                line2: billTo.address2 || 
                      billTo.line2 || 
                      '',
                city: billTo.city || 
                     customer.city || 
                     '',
                state: billTo.state || 
                      customer.state || 
                      '',
                postalCode: billTo.zip || 
                           billTo.postalCode || 
                           billTo.postal || 
                           customer.zip || 
                           '',
                country: billTo.country || 
                        customer.country || 
                        'US'
            }
        },
        lineItems,
        primaryProductName,
        productNames: lineItems.map(item => item.name).filter(Boolean),
        tags,
        rawPayload: payload
    };
}

/**
 * Normalize invoice line items
 */
function normalizeInvoiceLineItems(lineItemsData) {
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
            totalAmount: safeCurrencyParse(item.totalAmount ?? item.amount ?? item.unitPrice ?? 0)
        }));
}

/**
 * Build tags for invoice events
 */
function buildInvoiceTags(lineItems, primaryProductName, action, status) {
    const tags = new Set(['authorize.net']);

    // Add action-specific tags
    switch (action) {
        case 'created':
            tags.add('invoice-created');
            break;
        case 'sent':
            tags.add('invoice-sent');
            break;
        case 'paid':
            tags.add('invoice-paid');
            tags.add('sold bookkeeping project');
            break;
        case 'updated':
            tags.add('invoice-updated');
            break;
        case 'partial-payment':
            tags.add('invoice-partial-payment');
            break;
        case 'cancelled':
            tags.add('invoice-cancelled');
            break;
        case 'reminder':
            tags.add('invoice-reminder');
            break;
        case 'overdue-reminder':
            tags.add('invoice-overdue');
            break;
    }

    // Add status tag if available
    if (status) {
        tags.add(`invoice-${status.toLowerCase().replace(/\s+/g, '-')}`);
    }

    // Add product tags
    if (primaryProductName) {
        tags.add(slugifyProductTag(primaryProductName));
    }

    lineItems.forEach(item => {
        if (item.name) {
            tags.add(slugifyProductTag(item.name));
        }
    });

    return Array.from(tags).filter(Boolean);
}

/**
 * Build note body for invoice events
 */
function buildInvoiceNoteBody(normalized, action) {
    const actionLabels = {
        'created': 'Invoice Created',
        'sent': 'Invoice Sent',
        'paid': 'Invoice Paid',
        'updated': 'Invoice Updated',
        'partial-payment': 'Invoice Partial Payment',
        'cancelled': 'Invoice Cancelled',
        'reminder': 'Invoice Reminder',
        'overdue-reminder': 'Invoice Overdue Reminder'
    };

    const actionLabel = actionLabels[action] || 'Invoice Event';
    const lines = [
        `${actionLabel} (Authorize.net)`,
        normalized.invoiceNumber ? `Invoice Number: ${normalized.invoiceNumber}` : null,
        normalized.invoiceId ? `Invoice ID: ${normalized.invoiceId}` : null,
        `Amount: ${formatCurrency(normalized.amount, normalized.currencyCode)}`,
        normalized.status ? `Status: ${normalized.status}` : null,
        normalized.invoiceDate ? `Invoice Date: ${normalized.invoiceDate}` : null,
        normalized.dueDate ? `Due Date: ${normalized.dueDate}` : null
    ].filter(Boolean);

    // Add line items if available
    if (normalized.lineItems.length > 0) {
        lines.push('Line Items:');
        normalized.lineItems.forEach(item => {
            const itemLine = ` - ${item.name} (${formatCurrency(item.totalAmount || item.unitPrice, normalized.currencyCode)})`;
            if (item.description) {
                lines.push(`${itemLine} - ${item.description}`);
            } else {
                lines.push(itemLine);
            }
        });
    }

    return lines.join('\n');
}

/**
 * Fetch invoice details from Authorize.net API
 * Note: This is a fallback method - webhook payloads should contain all necessary data
 * Authorize.net Invoice API may not be available or may use a different format
 * This function tries to fetch details but gracefully fails if API is not available
 */
async function fetchAuthorizeNetInvoiceDetails(invoiceId) {
    if (!invoiceId) {
        return null;
    }

    try {
        // Try both sandbox and production configs
        const configs = buildAuthorizeNetConfigPriority();
        
        for (const config of configs) {
            try {
                const response = await fetchInvoiceDetails(config, invoiceId);
                if (response) {
                    return response;
                }
            } catch (error) {
                // This is expected if Invoice API is not available or uses different format
                console.log(`Invoice API not available with ${config.environment} config (this is OK):`, error.message);
                continue;
            }
        }

        // This is expected - Invoice API may not be available
        console.log('Invoice API not available - using webhook payload data only');
        return null;
    } catch (error) {
        // This is expected - Invoice API may not be available
        console.log('Invoice API error (this is OK):', error.message);
        return null;
    }
}

/**
 * Fetch invoice details using Authorize.net API
 * Note: Authorize.net Invoice API may use REST API instead of XML
 * This is a placeholder implementation - you may need to adjust based on Authorize.net API version
 */
async function fetchInvoiceDetails(config, invoiceId) {
    if (!cachedFetchInstance) {
        cachedFetchInstance = nodeFetch;
    }

    try {
        // Option 1: Try REST API endpoint (if available)
        // Authorize.net may have a REST API for invoices: GET /api/v1/invoices/{invoiceId}
        const restEndpoint = config.endpoint?.replace('/xml/v1/', '/api/v1/') || 
                            (config.environment === 'production' 
                                ? 'https://api.authorize.net/api/v1/invoices'
                                : 'https://apitest.authorize.net/api/v1/invoices');
        
        const restUrl = `${restEndpoint}/${invoiceId}`;
        
        try {
            const response = await cachedFetchInstance(restUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${config.loginId}:${config.transactionKey}`).toString('base64')}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const jsonData = await response.json();
                return jsonData;
            }
        } catch (restError) {
            console.log('REST API not available, trying XML API:', restError.message);
        }

        // Option 2: Try XML API endpoint (fallback)
        const xmlEndpoint = config.endpoint || 
                           (config.environment === 'production'
                               ? 'https://api.authorize.net/xml/v1/request.api'
                               : 'https://apitest.authorize.net/xml/v1/request.api');
        
        const xmlRequest = await buildGetInvoiceDetailsRequest(config, invoiceId);

        const response = await cachedFetchInstance(xmlEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/xml'
            },
            body: xmlRequest
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch invoice details: ${response.status} ${response.statusText}`);
        }

        const xmlText = await response.text();
        const parsed = await parseXmlResponse(xmlText);
        
        return parsed;
    } catch (error) {
        console.error('Error fetching invoice details:', error);
        // Return null if invoice details can't be fetched
        // The sync will continue with the data from the webhook payload
        return null;
    }
}

/**
 * Build XML request for getInvoiceDetails
 * Note: This is a placeholder - check Authorize.net API docs for exact format
 * Authorize.net may use a different API endpoint or format for invoice details
 */
async function buildGetInvoiceDetailsRequest(config, invoiceId) {
    // Note: Authorize.net Invoice API may use REST API instead of XML
    // This is a placeholder implementation
    // You may need to use the REST API: GET /api/v1/invoices/{invoiceId}
    
    const XMLBuilder = await getXmlBuilder();
    const builder = new XMLBuilder({ ignoreAttributes: false });

    const request = {
        getInvoiceDetailsRequest: {
            '@_xmlns': 'AnetApi/xml/v1/schema/AnetApiSchema.xsd',
            merchantAuthentication: {
                name: config.loginId,
                transactionKey: config.transactionKey
            },
            invoiceId: invoiceId
        }
    };

    return `<?xml version="1.0" encoding="utf-8"?>${builder.build(request)}`;
}

/**
 * Parse XML response
 */
async function parseXmlResponse(xmlText) {
    try {
        const XMLParser = await getXmlParser();
        const parser = new XMLParser({ ignoreAttributes: false });
        return parser.parse(xmlText);
    } catch (error) {
        console.error('Failed to parse XML response:', error);
        return null;
    }
}

/**
 * Helper functions (same as authorize-net-sync.js)
 */
function resolveContactId(contact) {
    if (!contact) {
        return null;
    }
    return contact.id || contact.contactId || contact.contact?.id || null;
}

function safeCurrencyParse(value) {
    if (value === null || value === undefined || value === '') {
        return 0;
    }
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : Number(value);
    return isNaN(num) ? 0 : Math.max(0, num);
}

function safeNumberParse(value, defaultValue = 0) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? defaultValue : num;
}

function formatCurrency(amount, currencyCode = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode
    }).format(amount);
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

