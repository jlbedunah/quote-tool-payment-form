const API_BASE_URL = process.env.GHL_API_BASE_URL || 'https://rest.gohighlevel.com/v1';
const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const PIPELINE_ID = process.env.GHL_PIPELINE_ID;
const WON_STAGE_ID = process.env.GHL_WON_STAGE_ID;

let cachedFetchInstance = typeof fetch === 'function' ? fetch.bind(globalThis) : null;

async function fetchWithFallback(url, options) {
    if (!cachedFetchInstance) {
        const { default: nodeFetch } = await import('node-fetch');
        cachedFetchInstance = nodeFetch;
    }
    return cachedFetchInstance(url, options);
}

function ensureApiKey(operation) {
    if (!API_KEY) {
        throw new Error(`GoHighLevel API key is required for ${operation}. Set GHL_API_KEY in the environment.`);
    }
}

function buildUrl(path, query) {
    const url = new URL(path.replace(/^\//, ''), API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`);
    if (query) {
        Object.entries(query)
            .filter(([, value]) => value !== undefined && value !== null && value !== '')
            .forEach(([key, value]) => {
                url.searchParams.append(key, value);
            });
    }
    return url.toString();
}

async function ghlRequest(path, { method = 'GET', query, body, headers } = {}) {
    ensureApiKey('API request');

    const url = buildUrl(path, query);
    const requestInit = {
        method,
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...headers
        }
    };

    if (body !== undefined) {
        requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetchWithFallback(url, requestInit);

    if (!response.ok) {
        const errorText = await safeReadText(response);
        console.error('GoHighLevel API error:', {
            url,
            status: response.status,
            statusText: response.statusText,
            body: errorText
        });
        throw new Error(`GoHighLevel API request failed with status ${response.status}`);
    }

    return safeParseJson(await response.text());
}

export async function findOrCreateContact(contactInput) {
    ensureApiKey('findOrCreateContact');

    if (!contactInput?.email) {
        throw new Error('Contact email is required to find or create a GoHighLevel contact.');
    }

    const normalizedEmail = contactInput.email.toLowerCase();

    const existing = await searchContactByEmail(normalizedEmail);

    if (existing) {
        await ensureContactUpToDate(existing.id, contactInput);
        return existing;
    }

    if (!LOCATION_ID) {
        throw new Error('GHL_LOCATION_ID is required to create new contacts.');
    }

    const createPayload = buildContactPayload({
        ...contactInput,
        email: normalizedEmail,
        locationId: LOCATION_ID
    });

    const createResponse = await ghlRequest('/contacts/', {
        method: 'POST',
        body: createPayload
    });

    return createResponse?.contact || createResponse;
}

export async function appendNoteToContact(contactId, body) {
    ensureApiKey('appendNoteToContact');

    if (!contactId) {
        throw new Error('Contact ID is required to append a note.');
    }

    return ghlRequest(`/contacts/${contactId}/notes/`, {
        method: 'POST',
        body: {
            body
        }
    });
}

export async function addTagsToContact(contactId, tags) {
    ensureApiKey('addTagsToContact');

    if (!contactId) {
        throw new Error('Contact ID is required to add tags.');
    }

    if (!Array.isArray(tags) || tags.length === 0) {
        return null;
    }

    return ghlRequest(`/contacts/${contactId}/tags/`, {
        method: 'POST',
        body: {
            tags
        }
    });
}

export async function updateContactCustomFields(contactId, fieldMap) {
    ensureApiKey('updateContactCustomFields');

    if (!contactId) {
        throw new Error('Contact ID is required to update custom fields.');
    }

    if (!fieldMap || Object.keys(fieldMap).length === 0) {
        return null;
    }

    return ghlRequest(`/contacts/${contactId}`, {
        method: 'PUT',
        body: {
            customField: fieldMap
        }
    });
}

export async function findOrCreateOrUpdateOpportunity(contactId, options) {
    ensureApiKey('findOrCreateOrUpdateOpportunity');

    if (!contactId) {
        throw new Error('Contact ID is required to manage opportunities.');
    }

    if (!PIPELINE_ID || !WON_STAGE_ID) {
        console.warn('GHL_PIPELINE_ID and GHL_WON_STAGE_ID must be set to manage opportunities. Skipping opportunity updates.');
        return null;
    }

    const amount = normalizeCurrency(options.amount);
    const opportunityName = buildOpportunityName(options.productName, options.invoiceNumber);

    const existing = await searchOpportunity(contactId);

    if (existing) {
        return updateOpportunity(existing.id, {
            pipelineId: PIPELINE_ID,
            stageId: WON_STAGE_ID,
            status: 'won',
            name: opportunityName,
            monetaryValue: amount,
            contactId,
            description: options.closingNotes,
            closeDate: options.saleDate
        });
    }

    if (!LOCATION_ID) {
        throw new Error('GHL_LOCATION_ID is required to create opportunities.');
    }

    return createOpportunity({
        contactId,
        pipelineId: PIPELINE_ID,
        stageId: WON_STAGE_ID,
        status: 'won',
        locationId: LOCATION_ID,
        monetaryValue: amount,
        name: opportunityName,
        description: options.closingNotes,
        closeDate: options.saleDate
    });
}

async function searchContactByEmail(email) {
    const response = await ghlRequest('/contacts/search', {
        query: {
            email
        }
    });

    if (Array.isArray(response?.contacts)) {
        return response.contacts.find(contact => contact.email?.toLowerCase() === email.toLowerCase()) || null;
    }

    return null;
}

async function ensureContactUpToDate(contactId, contactInput) {
    const updatePayload = buildContactPayload({
        ...contactInput,
        locationId: LOCATION_ID
    });

    // Remove email/locationId to avoid overwriting with identical values when not provided
    delete updatePayload.email;
    if (!updatePayload.locationId) {
        delete updatePayload.locationId;
    }

    return ghlRequest(`/contacts/${contactId}`, {
        method: 'PUT',
        body: updatePayload
    });
}

function buildContactPayload(contactInput) {
    const address = selectBestAddress(contactInput);

    const payload = {
        email: contactInput.email,
        firstName: nullIfEmpty(contactInput.firstName),
        lastName: nullIfEmpty(contactInput.lastName),
        name: buildFullName(contactInput.firstName, contactInput.lastName),
        phone: nullIfEmpty(contactInput.phone),
        companyName: nullIfEmpty(contactInput.company),
        address1: nullIfEmpty(address?.line1),
        city: nullIfEmpty(address?.city),
        state: nullIfEmpty(address?.state),
        postalCode: nullIfEmpty(address?.postalCode),
        country: nullIfEmpty(address?.country || 'US'),
        locationId: contactInput.locationId
    };

    return pruneUndefined(payload);
}

function selectBestAddress(contactInput) {
    return contactInput.shippingAddress?.line1 ? contactInput.shippingAddress
        : contactInput.billingAddress?.line1 ? contactInput.billingAddress
            : contactInput.address;
}

async function searchOpportunity(contactId) {
    const response = await ghlRequest('/opportunities/search', {
        query: {
            contactId,
            pipelineId: PIPELINE_ID
        }
    });

    if (Array.isArray(response?.opportunities) && response.opportunities.length > 0) {
        return response.opportunities[0];
    }

    return null;
}

function updateOpportunity(opportunityId, payload) {
    return ghlRequest(`/opportunities/${opportunityId}`, {
        method: 'PUT',
        body: payload
    });
}

function createOpportunity(payload) {
    return ghlRequest('/opportunities/', {
        method: 'POST',
        body: payload
    });
}

function buildOpportunityName(productName, invoiceNumber) {
    if (productName && invoiceNumber) {
        return `${productName} (${invoiceNumber})`;
    }

    if (productName) {
        return productName;
    }

    if (invoiceNumber) {
        return `Invoice ${invoiceNumber}`;
    }

    return 'Authorize.net Sale';
}

function normalizeCurrency(value) {
    if (value === null || value === undefined) {
        return 0;
    }

    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

async function safeReadText(response) {
    try {
        return await response.text();
    } catch (error) {
        console.warn('Failed to read GoHighLevel error body:', error);
        return null;
    }
}

function safeParseJson(text) {
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        console.warn('Failed to parse JSON from GoHighLevel API response. Returning raw text.');
        return { raw: text };
    }
}

function nullIfEmpty(value) {
    if (value === undefined || value === null) {
        return undefined;
    }

    const trimmed = String(value).trim();
    return trimmed.length === 0 ? undefined : trimmed;
}

function pruneUndefined(obj) {
    return Object.entries(obj)
        .filter(([, value]) => value !== undefined)
        .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});
}

function buildFullName(firstName, lastName) {
    const first = nullIfEmpty(firstName);
    const last = nullIfEmpty(lastName);

    if (first && last) {
        return `${first} ${last}`;
    }

    return first || last || undefined;
}
