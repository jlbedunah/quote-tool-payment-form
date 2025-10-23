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
                    order: { invoiceNumber: `INV-${Date.now()}` },
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

        const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
        let parsed;
        try {
            parsed = parser.parse(responseText);
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Invalid XML response from Authorize.net', details: responseText.slice(0, 200) });
        }

        const messages = parsed?.createTransactionResponse?.messages;
        const txr = parsed?.createTransactionResponse?.transactionResponse;
        const ok = messages?.resultCode === 'Ok' && txr?.responseCode === '1';
        if (ok) {
            // Log successful transaction (without sensitive data)
            console.log(`✅ ${isProduction ? 'PRODUCTION' : 'SANDBOX'} Transaction Approved:`, {
                transactionId: txr.transId,
                amount: amount,
                authCode: txr.authCode,
                environment: isProduction ? 'PRODUCTION' : 'SANDBOX'
            });
            
            return res.status(200).json({ 
                success: true, 
                transactionId: txr.transId, 
                message: txr?.messages?.message?.description || 'Approved', 
                authCode: txr.authCode, 
                amount,
                environment: isProduction ? 'production' : 'sandbox'
            });
        }
        
        // Log failed transaction
        const errorText = txr?.errors?.error?.errorText || messages?.message?.text || 'Transaction failed';
        console.log(`❌ ${isProduction ? 'PRODUCTION' : 'SANDBOX'} Transaction Failed:`, {
            error: errorText,
            amount: amount,
            environment: isProduction ? 'PRODUCTION' : 'SANDBOX'
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
