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

    const { secureData, customerData, lineItems } = req.body;

    // Debug logging
    console.log('Modern API received data:', {
        secureData: !!secureData,
        customerData: !!customerData,
        lineItems: lineItems?.length || 0,
        actualValues: {
            dataDescriptor: secureData?.dataDescriptor,
            dataValue: secureData?.dataValue ? '***' : 'MISSING',
            firstName: customerData?.firstName,
            lastName: customerData?.lastName,
            amount: customerData?.amount,
            lineItemsCount: lineItems?.length
        }
    });

    // Basic validation
    if (!secureData || !customerData || !customerData.firstName || !customerData.lastName || !customerData.amount) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            required: ['secureData', 'customerData.firstName', 'customerData.lastName', 'customerData.amount'],
            received: {
                secureData: !!secureData,
                firstName: !!customerData?.firstName,
                lastName: !!customerData?.lastName,
                amount: !!customerData?.amount
            }
        });
    }

    // Use test credentials for Modern API (these work with the test Client Key)
    const loginId = '5KP3u95bQpv';
    const transactionKey = '346HZ32z3fP4hTG2';

    console.log('Using test credentials for Authorize.net Modern API');

    // Authorize.net Modern API endpoint (Sandbox)
    const authorizeNetUrl = 'https://apitest.authorize.net/xml/v1/request.api';

    // Construct Modern API request
    const requestData = {
        createTransactionRequest: {
            merchantAuthentication: {
                name: loginId,
                transactionKey: transactionKey
            },
            refId: `REF-${Date.now()}`,
            transactionRequest: {
                transactionType: 'authCaptureTransaction',
                amount: customerData.amount,
                payment: {
                    opaqueData: {
                        dataDescriptor: secureData.dataDescriptor,
                        dataValue: secureData.dataValue
                    }
                },
                billTo: {
                    firstName: customerData.firstName,
                    lastName: customerData.lastName,
                    company: customerData.companyName || '',
                    address: customerData.address1,
                    city: customerData.city,
                    state: customerData.state,
                    zip: customerData.zip,
                    country: customerData.country || 'US',
                    phoneNumber: customerData.phoneNumber || '',
                    email: customerData.email
                },
                order: {
                    invoiceNumber: `INV-${Date.now()}`,
                    description: 'Quote Payment'
                }
            }
        }
    };

    // Add line items if present
    if (lineItems && lineItems.length > 0) {
        console.log('Adding line items to Modern API:', lineItems);
        requestData.createTransactionRequest.transactionRequest.lineItems = {
            lineItem: lineItems.map(item => ({
                itemId: item.itemId,
                name: item.name,
                description: item.description,
                quantity: item.quantity.toString(),
                unitPrice: item.unitPrice.toFixed(2)
            }))
        };
    }

    try {
        console.log('Sending request to Authorize.net Modern API:', JSON.stringify(requestData, null, 2));

        const response = await fetch(authorizeNetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        });

        const responseData = await response.json();
        console.log('Authorize.net Modern API Response:', JSON.stringify(responseData, null, 2));

        const transactionResponse = responseData.transactionResponse;
        
        if (transactionResponse && transactionResponse.responseCode === '1') {
            return res.status(200).json({
                success: true,
                message: 'Payment successful',
                transactionId: transactionResponse.transId,
                authCode: transactionResponse.authCode,
                rawResponse: responseData
            });
        } else {
            const errorMessage = transactionResponse?.errors?.[0]?.errorText || 'Payment declined';
            console.error('Authorize.net Modern API Error:', errorMessage, responseData);
            return res.status(400).json({
                success: false,
                error: errorMessage,
                rawResponse: responseData
            });
        }

    } catch (error) {
        console.error('Error communicating with Authorize.net Modern API:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process payment due to a network error.',
            details: error.message
        });
    }
}
