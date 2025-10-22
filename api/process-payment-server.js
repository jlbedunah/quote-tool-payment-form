import fetch from 'node-fetch';

export default async function handler(req, res) {
    // Check for protection bypass token
    const bypassToken = req.headers['x-vercel-protection-bypass'];
    const expectedBypassToken = process.env.VERCEL_PROTECTION_BYPASS;
    
    if (expectedBypassToken && bypassToken !== expectedBypassToken) {
        return res.status(401).json({ error: 'Unauthorized - Invalid bypass token' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('Received request body:', JSON.stringify(req.body, null, 2));
        
        const { 
            cardNumber, 
            expDate, 
            cardCode, 
            firstName, 
            lastName, 
            companyName, 
            address1, 
            address2, 
            city, 
            state, 
            zip, 
            country, 
            phoneNumber, 
            email, 
            amount, 
            lineItems 
        } = req.body;

        // Server-side validation
        if (!cardNumber || !expDate || !cardCode || !amount || !firstName || !lastName || !address1 || !city || !state || !zip || !email) {
            console.error('Missing required fields for transaction:', { 
                cardNumber: !!cardNumber, 
                expDate: !!expDate, 
                cardCode: !!cardCode, 
                amount, 
                firstName, 
                lastName, 
                address1, 
                city, 
                state, 
                zip, 
                email 
            });
            return res.status(400).json({ success: false, error: 'Missing required payment or customer information.' });
        }

        // Validate card number format (basic Luhn check)
        if (!isValidCardNumber(cardNumber)) {
            return res.status(400).json({ success: false, error: 'Invalid card number format.' });
        }

        // Validate expiration date
        if (!isValidExpDate(expDate)) {
            return res.status(400).json({ success: false, error: 'Invalid expiration date format.' });
        }

        // Validate CVV
        if (!isValidCVV(cardCode)) {
            return res.status(400).json({ success: false, error: 'Invalid CVV format.' });
        }

        // Get Authorize.net credentials
        const loginId = process.env.AUTHORIZE_NET_LOGIN_ID;
        const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;

        console.log('Using Authorize.net credentials:', {
            loginId: loginId ? loginId.substring(0, 2) + '****' : 'MISSING',
            transactionKey: transactionKey ? 'CONFIGURED' : 'MISSING'
        });

        if (!loginId || !transactionKey) {
            return res.status(500).json({
                success: false,
                error: 'Authorize.net credentials not configured. Please add AUTHORIZE_NET_LOGIN_ID and AUTHORIZE_NET_TRANSACTION_KEY to environment variables.'
            });
        }

        // Authorize.net JSON API endpoint (Sandbox) - accepts JSON format
        const authorizeNetUrl = 'https://apitest.authorize.net/json/v1/request.api';

        // Parse expiration date
        const [month, year] = expDate.split('/');
        const fullYear = year.length === 2 ? '20' + year : year;

        // Construct Authorize.net request (matching working example)
        const transactionRequest = {
            createTransactionRequest: {
                merchantAuthentication: {
                    name: loginId,
                    transactionKey: transactionKey,
                },
                refId: `ref${Date.now()}`, // Unique reference ID
                transactionRequest: {
                transactionType: 'authCaptureTransaction',
                amount: parseFloat(amount).toFixed(2),
                payment: {
                    creditCard: {
                        cardNumber: cardNumber.replace(/\s/g, ''), // Remove spaces
                        expirationDate: `${fullYear}-${month.padStart(2, '0')}`,
                        cardCode: cardCode
                    }
                },
                billTo: {
                    firstName: firstName,
                    lastName: lastName,
                    company: companyName || '',
                    address: address1,
                    city: city,
                    state: state,
                    zip: zip,
                    country: country || 'US',
                    email: email,
                },
                // Line items structure matching working example
                lineItems: lineItems && lineItems.length > 0 ? {
                    lineItem: lineItems.map(item => ({
                        itemId: item.itemId,
                        name: item.name,
                        description: item.description || '',
                        quantity: item.quantity.toString(),
                        unitPrice: parseFloat(item.unitPrice).toFixed(2),
                        taxable: (item.taxable || false).toString(),
                    }))
                } : undefined,
                // Test mode for sandbox (false for sandbox, true for production)
                transactionSettings: {
                    setting: {
                        settingName: "testRequest",
                        settingValue: "false"
                    }
                }
            },
        };

        console.log('Sending transaction request to Authorize.net:', JSON.stringify(transactionRequest, null, 2));

        const authNetResponse = await fetch(authorizeNetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(transactionRequest),
        });

        console.log('Authorize.net response status:', authNetResponse.status);
        console.log('Authorize.net response headers:', Object.fromEntries(authNetResponse.headers.entries()));
        
        const responseText = await authNetResponse.text();
        console.log('Authorize.net raw response text:', responseText.substring(0, 500)); // First 500 chars
        
        let authNetResult;
        try {
            authNetResult = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse JSON response:', parseError);
            console.error('Response was:', responseText);
            return res.status(500).json({
                success: false,
                error: 'Invalid response format from Authorize.net',
                details: responseText.substring(0, 200)
            });
        }
        console.log('Authorize.net raw response:', JSON.stringify(authNetResult, null, 2));
        console.log('Response structure analysis:', {
            hasMessages: !!authNetResult.messages,
            hasTransactionResponse: !!authNetResult.transactionResponse,
            responseKeys: Object.keys(authNetResult)
        });

        // Handle different response structures
        let isSuccess = false;
        let transactionId = null;
        let message = '';
        let authCode = null;

        if (authNetResult.messages && authNetResult.messages.resultCode === 'Ok' && authNetResult.transactionResponse && authNetResult.transactionResponse.responseCode === '1') {
            // XML API response format
            isSuccess = true;
            transactionId = authNetResult.transactionResponse.transId;
            message = authNetResult.transactionResponse.messages[0].description;
            authCode = authNetResult.transactionResponse.authCode;
        } else if (authNetResult.transactionResponse && authNetResult.transactionResponse.responseCode === '1') {
            // JSON API response format (different structure)
            isSuccess = true;
            transactionId = authNetResult.transactionResponse.transId;
            message = authNetResult.transactionResponse.messages[0].description;
            authCode = authNetResult.transactionResponse.authCode;
        } else if (authNetResult.responseCode === '1') {
            // Alternative JSON API response format
            isSuccess = true;
            transactionId = authNetResult.transId;
            message = authNetResult.messages[0].description;
            authCode = authNetResult.authCode;
        }

        if (isSuccess) {
            // Transaction successful
            console.log('Transaction successful:', {
                transactionId,
                authCode,
                amount: amount
            });

            return res.status(200).json({
                success: true,
                transactionId,
                message,
                authCode,
                amount: amount
            });
        } else {
            // Transaction failed - handle different response structures
            let errorMessage = 'Transaction failed.';
            let errors = [];
            
            if (authNetResult.transactionResponse?.errors?.[0]?.errorText) {
                errorMessage = authNetResult.transactionResponse.errors[0].errorText;
                errors = authNetResult.transactionResponse.errors;
            } else if (authNetResult.messages?.message?.[0]?.text) {
                errorMessage = authNetResult.messages.message[0].text;
            } else if (authNetResult.messages?.message?.text) {
                errorMessage = authNetResult.messages.message.text;
            } else if (authNetResult.error) {
                errorMessage = authNetResult.error;
            } else if (authNetResult.message) {
                errorMessage = authNetResult.message;
            }
            
            console.error('Authorize.net transaction error:', errorMessage, errors);
            console.error('Full response for debugging:', JSON.stringify(authNetResult, null, 2));
            
            return res.status(400).json({
                success: false,
                error: errorMessage,
                errors: errors,
            });
        }

    } catch (error) {
        console.error('Server error processing payment:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error: ' + error.message 
        });
    }
}

// Helper functions for validation
function isValidCardNumber(cardNumber) {
    // Remove spaces and non-digits
    const cleaned = cardNumber.replace(/\s/g, '').replace(/\D/g, '');
    
    // Check length (13-19 digits)
    if (cleaned.length < 13 || cleaned.length > 19) {
        return false;
    }
    
    // Basic Luhn algorithm check
    let sum = 0;
    let isEven = false;
    
    for (let i = cleaned.length - 1; i >= 0; i--) {
        let digit = parseInt(cleaned[i]);
        
        if (isEven) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        
        sum += digit;
        isEven = !isEven;
    }
    
    return sum % 10 === 0;
}

function isValidExpDate(expDate) {
    // Check format MM/YY or MM/YYYY
    const regex = /^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/;
    if (!regex.test(expDate)) {
        return false;
    }
    
    const [month, year] = expDate.split('/');
    const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    // Check if expiration is in the future
    if (fullYear < currentYear || (fullYear === currentYear && parseInt(month) < currentMonth)) {
        return false;
    }
    
    return true;
}

function isValidCVV(cvv) {
    // CVV should be 3-4 digits
    const regex = /^\d{3,4}$/;
    return regex.test(cvv);
}
