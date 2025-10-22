import crypto from 'crypto';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      cardNumber,
      expirationDate,
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

    // Validate required fields
    if (!cardNumber || !expirationDate || !cardCode || !firstName || !lastName || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['cardNumber', 'expirationDate', 'cardCode', 'firstName', 'lastName', 'amount']
      });
    }

    // Check if Authorize.net credentials are available
    const loginId = process.env.AUTHORIZE_NET_LOGIN_ID;
    const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;

    if (!loginId || !transactionKey) {
      return res.status(500).json({ 
        error: 'Authorize.net credentials not configured' 
      });
    }

    // Create transaction request
    const transactionRequest = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: loginId,
          transactionKey: transactionKey
        },
        refId: `ref_${Date.now()}`,
        transactionRequest: {
          transactionType: 'authCaptureTransaction',
          amount: amount,
          payment: {
            creditCard: {
              cardNumber: cardNumber.replace(/\s/g, ''), // Remove spaces
              expirationDate: expirationDate,
              cardCode: cardCode
            }
          },
          billTo: {
            firstName: firstName,
            lastName: lastName,
            company: companyName || '',
            address: address1 || '',
            city: city || '',
            state: state || '',
            zip: zip || '',
            country: country || 'US',
            phoneNumber: phoneNumber || '',
            email: email || ''
          },
          lineItems: lineItems || []
        }
      }
    };

    // Send request to Authorize.net
    const authnetResponse = await fetch('https://apitest.authorize.net/xml/v1/request.api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transactionRequest)
    });

    const authnetResult = await authnetResponse.json();

    // Log the transaction (for debugging - remove in production)
    console.log('Authorize.net Response:', JSON.stringify(authnetResult, null, 2));

    // Check if transaction was successful
    if (authnetResult.messages.resultCode === 'Ok') {
      const transaction = authnetResult.transactionResponse;
      
      return res.status(200).json({
        success: true,
        transactionId: transaction.transId,
        authCode: transaction.authCode,
        responseCode: transaction.responseCode,
        message: 'Payment processed successfully'
      });
    } else {
      // Transaction failed
      const errors = authnetResult.transactionResponse?.errors || [];
      const errorMessages = errors.map(error => error.errorText).join(', ');
      
      return res.status(400).json({
        success: false,
        error: errorMessages || 'Transaction failed',
        responseCode: authnetResult.transactionResponse?.responseCode,
        errors: errors
      });
    }

  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
