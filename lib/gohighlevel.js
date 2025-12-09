import { logError } from './logger.js';

const API_BASE_URL = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com/';
const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const PIPELINE_ID = process.env.GHL_PIPELINE_ID;
const WON_STAGE_ID = process.env.GHL_WON_STAGE_ID;
const API_VERSION = process.env.GHL_API_VERSION || '2021-07-28';

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
            Version: API_VERSION,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(LOCATION_ID ? { LocationId: LOCATION_ID } : {}),
            ...headers
        }
    };

    if (body !== undefined) {
        requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetchWithFallback(url, requestInit);

    if (!response.ok) {
        const errorText = await safeReadText(response);
        const errorDetails = {
            url,
            status: response.status,
            statusText: response.statusText,
            body: errorText
        };
        
        // Log error to Supabase
        await logError(
            'lib/gohighlevel.js',
            `GoHighLevel API request failed: ${response.status} ${response.statusText}`,
            {
                url,
                method: method,
                status: response.status
            },
            new Error(errorText)
        );
        
        // Create error with more details
        const error = new Error(`GoHighLevel API request failed with status ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.statusText = response.statusText;
        error.url = url;
        error.responseBody = errorText;
        throw error;
    }

    return safeParseJson(await response.text());
}

export async function findOrCreateContact(contactInput) {
    ensureApiKey('findOrCreateContact');

    if (!contactInput?.email) {
        throw new Error('Contact email is required to find or create a GoHighLevel contact.');
    }

    if (!LOCATION_ID) {
        throw new Error('GHL_LOCATION_ID is required to create new contacts.');
    }

    const normalizedEmail = contactInput.email.toLowerCase().trim();
    
    console.log('findOrCreateContact: Starting search/create:', {
        email: normalizedEmail,
        hasFirstName: !!contactInput.firstName,
        hasLastName: !!contactInput.lastName,
        hasPhone: !!contactInput.phone,
        tagsCount: Array.isArray(contactInput.tags) ? contactInput.tags.length : 0,
        locationId: LOCATION_ID
    });

    // First, try to find existing contact by email
    try {
        const existing = await searchContactByEmail(normalizedEmail);
        
        if (existing) {
            console.log('findOrCreateContact: Found existing contact:', {
                contactId: existing.id,
                email: existing.email
            });
            
            // Update existing contact with new information
            await ensureContactUpToDate(existing.id, contactInput);
            return existing;
        }
    } catch (searchError) {
        // If search fails, log but continue to create new contact
        console.warn('findOrCreateContact: Search failed, will create new contact:', {
            error: searchError.message
        });
        await logError(
            'lib/gohighlevel.js',
            'Contact search failed, proceeding to create new contact',
            { email: normalizedEmail },
            searchError
        );
    }

    // Contact doesn't exist, create a new one
    console.log('findOrCreateContact: Creating new contact');
    
    const createPayload = buildContactPayload({
        ...contactInput,
        email: normalizedEmail,
        locationId: LOCATION_ID
    });

    console.log('findOrCreateContact: Create payload:', {
        email: createPayload.email,
        firstName: createPayload.firstName,
        lastName: createPayload.lastName,
        phone: createPayload.phone,
        tags: createPayload.tags,
        locationId: createPayload.locationId
    });

    try {
        const createResponse = await ghlRequest('/contacts/', {
            method: 'POST',
            body: createPayload
        });

        console.log('findOrCreateContact: Create response received:', {
            hasResponse: !!createResponse,
            responseKeys: createResponse ? Object.keys(createResponse) : [],
            hasContact: !!createResponse?.contact,
            contactId: createResponse?.contact?.id || createResponse?.id,
            responsePreview: JSON.stringify(createResponse).substring(0, 500)
        });

        // Return contact from response (handle both wrapped and direct formats)
        const contact = createResponse?.contact || createResponse;
        
        if (!contact || !contact.id) {
            console.error('findOrCreateContact: WARNING - No contact ID in response!', {
                response: createResponse,
                extracted: contact
            });
            throw new Error('Failed to create contact: No contact ID in response');
        }

        console.log('findOrCreateContact: Successfully created contact:', {
            contactId: contact.id,
            email: contact.email
        });

        return contact;
    } catch (error) {
        console.error('findOrCreateContact: Error during contact creation:', {
            email: normalizedEmail,
            errorMessage: error.message,
            errorStatus: error.status,
            errorUrl: error.url,
            errorResponseBody: error.responseBody
        });
        throw error;
    }
}

// Helper function to search for contact by email
async function searchContactByEmail(email) {
    try {
        const response = await ghlRequest('/contacts/search', {
            query: {
                email
            }
        });

        if (Array.isArray(response?.contacts)) {
            const found = response.contacts.find(contact => 
                contact.email?.toLowerCase() === email.toLowerCase()
            );
            return found || null;
        }

        return null;
    } catch (error) {
        // If search endpoint doesn't exist or fails, return null to proceed with creation
        console.warn('searchContactByEmail: Search failed:', error.message);
        return null;
    }
}

// Helper function to update existing contact
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

    // Only update if there's something to update
    if (Object.keys(updatePayload).length === 0) {
        return null;
    }

    try {
        return await ghlRequest(`/contacts/${contactId}`, {
            method: 'PUT',
            body: updatePayload
        });
    } catch (error) {
        // Log but don't fail - contact exists, update is optional
        console.warn('ensureContactUpToDate: Update failed:', error.message);
        return null;
    }
}

export async function appendNoteToContact(contactId, body) {
    ensureApiKey('appendNoteToContact');

    if (!contactId) {
        throw new Error('Contact ID is required to append a note.');
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
        console.warn('appendNoteToContact: Note body is empty or invalid:', {
            contactId,
            bodyType: typeof body,
            bodyLength: body?.length
        });
        throw new Error('Note body is required and must be a non-empty string.');
    }

    console.log('appendNoteToContact: Making API request:', {
        contactId,
        noteBodyLength: body.length,
        noteBodyPreview: body.substring(0, 100)
    });

    try {
        const result = await ghlRequest(`/contacts/${contactId}/notes/`, {
            method: 'POST',
            body: {
                body
            }
        });
        
        console.log('appendNoteToContact: API request successful:', {
            contactId,
            hasResult: !!result
        });
        
        return result;
    } catch (error) {
        // Error already logged in ghlRequest, but add context here
        await logError(
            'lib/gohighlevel.js',
            'appendNoteToContact: API request failed',
            {
                contactId,
                noteBodyLength: body.length
            },
            error
        );
        throw error;
    }
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
        locationId: contactInput.locationId,
        tags: Array.isArray(contactInput.tags) ? contactInput.tags : undefined
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

function extractContactFromResponse(response) {
    if (!response) {
        return null;
    }

    if (response.contact) {
        return response.contact;
    }

    if (Array.isArray(response.contacts) && response.contacts.length > 0) {
        return response.contacts[0];
    }

    return response;
}
