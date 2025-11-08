import { findOrCreateContact, appendNoteToContact, addTagsToContact } from './gohighlevel.js';

export async function syncAuthorizeNetTransaction(eventBody) {
    if (!eventBody || eventBody.eventType !== 'net.authorize.payment.authcapture.created') {
        console.log('syncAuthorizeNetTransaction called with unsupported event type. Skipping.');
        return { skipped: true, reason: 'Unsupported event type' };
    }

    const normalized = normalizeAuthorizeNetPayload(eventBody);

    if (!normalized.email) {
        console.warn('Authorize.net webhook missing customer email. Skipping CRM sync.', {
            normalizedSummary: {
                transactionId: normalized.transactionId,
                invoiceNumber: normalized.invoiceNumber,
                amount: normalized.amount
            }
        });
        return { skipped: true, reason: 'Missing customer email', normalized };
    }

    const contact = await findOrCreateContact({
        email: normalized.email,
        firstName: normalized.customer.firstName,
        lastName: normalized.customer.lastName,
        phone: normalized.customer.phone,
        company: normalized.customer.company,
        address: normalized.customer.address,
        shippingAddress: normalized.shipping,
        billingAddress: normalized.billing
    });

    const contactId = resolveContactId(contact);

    if (!contactId) {
        throw new Error('Unable to determine GoHighLevel contact ID from response');
    }

    const noteBody = buildNoteBody(normalized);
    await appendNoteToContact(contactId, noteBody);

    if (normalized.tags.length > 0) {
        await addTagsToContact(contactId, normalized.tags);
    }

    console.log('Skipped GoHighLevel custom field and opportunity updates (handled via workflow).');

    return {
        contactId,
        normalized
    };
}

function normalizeAuthorizeNetPayload(eventBody) {
    const payload = eventBody?.payload || {};

    const lineItems = normalizeLineItems(payload.order?.lineItems || payload.lineItems);
    const primaryProductName = payload.order?.description || (lineItems[0]?.name ?? 'Authorize.net Sale');

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

function slugifyProductTag(name) {
    if (!name) {
        return null;
    }

    const prefix = process.env.GHL_PRODUCT_TAG_PREFIX || 'customer-product-';

    return prefix + name
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

    if (normalized.lineItems.length > 1) {
        lines.push('Line Items:');
        normalized.lineItems.forEach(item => {
            lines.push(` - ${item.name} (${formatCurrency(item.totalAmount || item.unitPrice, normalized.currencyCode)})`);
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
