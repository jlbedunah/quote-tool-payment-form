import fetch from 'node-fetch';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

export default async function handler(req, res) {
    const bypassToken = req.headers['x-vercel-protection-bypass'];
    const expectedBypassToken = process.env.VERCEL_PROTECTION_BYPASS;
    if (expectedBypassToken && bypassToken !== expectedBypassToken) {
        return res.status(401).json({ error: 'Unauthorized - Invalid bypass token' });
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { cardNumber, expDate, cardCode, firstName, lastName, companyName, address1, city, state, zip, country, email, amount, lineItems } = req.body;
        if (!cardNumber || !expDate || !cardCode || !amount || !firstName || !lastName || !address1 || !city || !state || !zip || !email) {
            return res.status(400).json({ success: false, error: 'Missing required payment or customer information.' });
        }
        // Determine environment (production vs sandbox)
        const isProduction = process.env.NODE_ENV === 'production' || process.env.AUTHORIZE_NET_ENVIRONMENT === 'production';
        
        // Get credentials based on environment
        const loginId = isProduction ? process.env.AUTHORIZE_NET_LOGIN_ID_PROD : process.env.AUTHORIZE_NET_LOGIN_ID;
        const transactionKey = isProduction ? process.env.AUTHORIZE_NET_TRANSACTION_KEY_PROD : process.env.AUTHORIZE_NET_TRANSACTION_KEY;
        
        console.log('Payment processing environment:', isProduction ? 'PRODUCTION' : 'SANDBOX');
        console.log('Using Login ID:', loginId ? loginId.substring(0, 4) + '****' : 'MISSING');
        
        if (!loginId || !transactionKey) {
            return res.status(500).json({ 
                success: false, 
                error: `Authorize.net ${isProduction ? 'production' : 'sandbox'} credentials not configured.` 
            });
        }

        // Enhanced validation for production
        if (isProduction) {
            // Additional validation for production
            if (!isValidCardNumber(cardNumber)) {
                return res.status(400).json({ success: false, error: 'Invalid card number format.' });
            }
            if (!isValidExpDate(expDate)) {
                return res.status(400).json({ success: false, error: 'Invalid expiration date format.' });
            }
            if (!isValidCVV(cardCode)) {
                return res.status(400).json({ success: false, error: 'Invalid CVV format.' });
            }
        }

                const [month, yearPart] = expDate.split('/');
                const fullYear = yearPart.length === 2 ? '20' + yearPart : yearPart;
                const expirationDate = `${fullYear}-${month.padStart(2, '0')}`; // YYYY-MM

                // Generate invoice number (store it to return in response)
                const invoiceNumber = `INV-${Date.now()}`;

                // Prepare customer data (Authorize.net allows optional customer section)
                const customerData = {};
                if (email) {
                    customerData.email = email;
                    const sanitizedId = email.split('@')[0]?.replace(/[^a-zA-Z0-9]/g, '');
                    if (sanitizedId) {
                        customerData.id = sanitizedId.slice(0, 20);
                    }
                }

                // Build XML payload
                const builder = new XMLBuilder({ ignoreAttributes: false });
                const payload = {
                    createTransactionRequest: {
                        '@_xmlns': 'AnetApi/xml/v1/schema/AnetApiSchema.xsd',
                        merchantAuthentication: { name: loginId, transactionKey },
                        refId: `ref${Date.now()}`,
                        transactionRequest: {
                            transactionType: 'authCaptureTransaction',
                            amount: Number(parseFloat(amount).toFixed(2)),
                            payment: { creditCard: { cardNumber: cardNumber.replace(/\s/g, ''), expirationDate, cardCode } },
                            // Order must appear before lineItems/billTo per schema ordering
                            order: { invoiceNumber },
                    // lineItems is a sibling of order, not nested inside order
                    ...(lineItems && lineItems.length > 0 ? {
                        lineItems: {
                            lineItem: lineItems.map((it, idx) => ({
                                itemId: it.itemId || String(idx + 1),
                                name: (it.name || '').slice(0, 31),
                                description: (it.description || '').slice(0, 255),
                                quantity: String(Math.max(1, Number(it.quantity) || 1)),
                                unitPrice: String(Number(parseFloat(it.unitPrice).toFixed(2))),
                                taxable: String(Boolean(it.taxable))
                            }))
                        }
                    } : {}),
                    ...(Object.keys(customerData).length > 0 ? { customer: customerData } : {}),
                    billTo: {
                        firstName, lastName, company: companyName || '', address: address1,
                        city, state, zip, country: country || 'US', email
                    },
                    transactionSettings: {
                        setting: [ 
                            { settingName: 'testRequest', settingValue: isProduction ? 'false' : 'true' }
                        ]
                    }
                }
            }
        };
        const xmlBody = builder.build(payload);

        // Use production or sandbox endpoint based on environment
        const authorizeNetUrl = isProduction 
            ? 'https://api.authorize.net/xml/v1/request.api'
            : 'https://apitest.authorize.net/xml/v1/request.api';
        const authNetResponse = await fetch(authorizeNetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml', 'Accept': 'application/xml' },
            body: xmlBody
        });
        
        console.log(`Authorize.net ${isProduction ? 'PRODUCTION' : 'SANDBOX'} response status:`, authNetResponse.status);
        
        const responseText = await authNetResponse.text();
        
        // Log raw XML response for debugging (first 1000 chars)
        console.log('Raw Authorize.net XML response (first 1000 chars):', responseText.substring(0, 1000));

        const parser = new XMLParser({ 
            ignoreAttributes: false, 
            parseTagValue: true,
            parseNodeValue: true,
            trimValues: true,
            parseTrueNumberOnly: false
        });
        let parsed;
        try {
            parsed = parser.parse(responseText);
            console.log('Full parsed XML structure:', JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.error('XML parsing error:', e);
            return res.status(500).json({ success: false, error: 'Invalid XML response from Authorize.net', details: responseText.slice(0, 200) });
        }

        const messages = parsed?.createTransactionResponse?.messages;
        const txr = parsed?.createTransactionResponse?.transactionResponse;
        
        // Debug logging
        console.log('Parsed response structure:', JSON.stringify({
            messagesResultCode: messages?.resultCode,
            txrResponseCode: txr?.responseCode,
            txrTransId: txr?.transId,
            txrAuthCode: txr?.authCode,
            txrMessages: txr?.messages,
            txrErrors: txr?.errors,
            fullTxr: txr
        }, null, 2));
        
        // Extract transaction ID - try multiple possible paths
        // Authorize.net XML structure: createTransactionResponse.transactionResponse.transId
        let transactionId = null;
        
        // Try all possible paths for transaction ID
        const possiblePaths = [
            () => txr?.transId,
            () => txr?.transactionId,
            () => txr?.['transId'],
            () => parsed?.createTransactionResponse?.transactionResponse?.transId,
            () => parsed?.createTransactionResponse?.transactionResponse?.['transId'],
            () => parsed?.createTransactionResponse?.transactionResponse?.transId?.[0], // Array case
            () => txr?.transactionResponse?.transId,
            () => txr?.transactionResponse?.['transId']
        ];
        
        for (const getPath of possiblePaths) {
            try {
                const value = getPath();
                if (value !== null && value !== undefined && value !== '') {
                    transactionId = String(value);
                    console.log('Found transaction ID via path:', getPath.toString(), '=', transactionId);
                    break;
                }
            } catch (e) {
                // Continue to next path
            }
        }
        
        // If still null, check if it's actually "0" (which Authorize.net returns for test transactions)
        if (!transactionId && (txr?.transId === '0' || txr?.transId === 0)) {
            transactionId = '0';
            console.log('Transaction ID is 0 (test/sandbox transaction - this is normal)');
        }
        
        // Log what we found
        console.log('Transaction ID extraction result:', {
            found: !!transactionId,
            value: transactionId,
            txrKeys: txr ? Object.keys(txr) : 'txr is null',
            txrTransId: txr?.transId,
            txrTransactionId: txr?.transactionId,
            fullTxrStructure: JSON.stringify(txr, null, 2)
        });
        
        // Check for success - multiple conditions
        const resultCodeOk = messages?.resultCode === 'Ok';
        const responseCodeOk = txr?.responseCode === '1';
        const hasTransactionId = !!transactionId; // Accept "0" as valid (test transactions)
        
        // Also check if error message contains "successful" (case-insensitive) - sometimes Authorize.net returns success in error field
        const errorText = txr?.errors?.error?.errorText || 
                         txr?.errors?.error?.[0]?.errorText || 
                         (Array.isArray(txr?.errors?.error) ? txr.errors.error[0]?.errorText : null) ||
                         messages?.message?.text || 
                         (Array.isArray(messages?.message) ? messages.message[0]?.text : null) ||
                         'Transaction failed';
        const errorIndicatesSuccess = errorText && errorText.toLowerCase().includes('successful');
        
        const ok = (resultCodeOk && responseCodeOk) || (hasTransactionId && !txr?.errors) || errorIndicatesSuccess;
        
        if (ok) {
            // Log successful transaction (without sensitive data)
            console.log(`✅ ${isProduction ? 'PRODUCTION' : 'SANDBOX'} Transaction Approved:`, {
                transactionId: transactionId,
                amount: amount,
                authCode: txr?.authCode,
                environment: isProduction ? 'PRODUCTION' : 'SANDBOX'
            });
            
            const responseData = { 
                success: true, 
                transactionId: transactionId || null, 
                invoiceNumber: invoiceNumber,
                message: txr?.messages?.message?.description || 
                        (Array.isArray(txr?.messages?.message) ? txr.messages.message[0]?.description : null) ||
                        'Approved', 
                authCode: txr?.authCode, 
                amount,
                environment: isProduction ? 'production' : 'sandbox',
                debug: {
                    hasTransactionId: !!transactionId,
                    transactionIdValue: transactionId,
                    txrResponseCode: txr?.responseCode,
                    messagesResultCode: messages?.resultCode
                }
            };
            
            console.log('Sending success response:', JSON.stringify(responseData, null, 2));
            
            return res.status(200).json(responseData);
        }
        
        // Log failed transaction
        console.log(`❌ ${isProduction ? 'PRODUCTION' : 'SANDBOX'} Transaction Failed:`, {
            error: errorText,
            amount: amount,
            environment: isProduction ? 'PRODUCTION' : 'SANDBOX',
            responseCode: txr?.responseCode,
            resultCode: messages?.resultCode
        });
        
        return res.status(400).json({ 
            success: false, 
            error: errorText, 
            raw: parsed,
            environment: isProduction ? 'production' : 'sandbox'
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
    }
}

// Validation helpers (unchanged)
function isValidCardNumber(cardNumber) {
    const cleaned = cardNumber.replace(/\s/g, '').replace(/\D/g, '');
    if (cleaned.length < 13 || cleaned.length > 19) return false;
    let sum = 0, isEven = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
        let digit = parseInt(cleaned[i]);
        if (isEven) { digit *= 2; if (digit > 9) digit -= 9; }
        sum += digit; isEven = !isEven;
    }
    return sum % 10 === 0;
}
function isValidExpDate(expDate) {
    const regex = /^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/;
    if (!regex.test(expDate)) return false;
    const [m, y] = expDate.split('/');
    const fy = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    const cy = new Date().getFullYear();
    const cm = new Date().getMonth() + 1;
    if (fy < cy || (fy === cy && parseInt(m) < cm)) return false;
    return true;
}
function isValidCVV(cvv) { return /^\d{3,4}$/.test(cvv); }
