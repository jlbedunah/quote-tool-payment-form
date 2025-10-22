import crypto from 'crypto';

export default async function handler(req, res) {
  // Check for protection bypass token
  const bypassToken = req.headers['x-vercel-protection-bypass'];
  const expectedBypassToken = process.env.VERCEL_PROTECTION_BYPASS;
  
  if (expectedBypassToken && bypassToken !== expectedBypassToken) {
    return res.status(401).json({ error: 'Unauthorized - Invalid bypass token' });
  }

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

    // Debug logging
    console.log('API received data:', {
      cardNumber: !!cardNumber,
      expirationDate: !!expirationDate,
      cardCode: !!cardCode,
      firstName: !!firstName,
      lastName: !!lastName,
      amount: !!amount,
      actualValues: {
        cardNumber: cardNumber ? cardNumber.substring(0, 4) + '****' : 'MISSING',
        expirationDate,
        cardCode: cardCode ? '***' : 'MISSING',
        firstName,
        lastName,
        amount
      }
    });

    // Validate required fields
    if (!cardNumber || !expirationDate || !cardCode || !firstName || !lastName || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['cardNumber', 'expirationDate', 'cardCode', 'firstName', 'lastName', 'amount'],
        received: {
          cardNumber: !!cardNumber,
          expirationDate: !!expirationDate,
          cardCode: !!cardCode,
          firstName: !!firstName,
          lastName: !!lastName,
          amount: !!amount
        }
      });
    }

    // Check if Authorize.net credentials are available
    let loginId = process.env.AUTHORIZE_NET_LOGIN_ID;
    let transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;

    // Log which credentials are being used
    console.log('Using Login ID:', loginId ? loginId.substring(0, 2) + '****' : 'MISSING');

    // Use test credentials if environment variables are not set or invalid
    if (!loginId || !transactionKey) {
      console.log('Using test credentials for Authorize.net');
      loginId = '5KP3u95bQpv';
      transactionKey = '346HZ32z3fP4hTG2';
    }

    // Authorize.net API endpoint (Sandbox)
    const authorizeNetUrl = 'https://test.authorize.net/gateway/transact.dll';

    // Construct Authorize.net POST data
    const params = new URLSearchParams();
    params.append('x_login', loginId);
    params.append('x_tran_key', transactionKey);
    params.append('x_version', '3.1');
    params.append('x_delim_data', 'TRUE');
    params.append('x_delim_char', '|');
    params.append('x_relay_response', 'FALSE');
    params.append('x_type', 'AUTH_CAPTURE'); // or AUTH_ONLY
    params.append('x_method', 'CC');
    params.append('x_card_num', cardNumber);
    params.append('x_exp_date', expirationDate); // MM/YY
    params.append('x_card_code', cardCode);
    params.append('x_amount', amount);
    params.append('x_first_name', firstName);
    params.append('x_last_name', lastName);
    params.append('x_company', companyName || '');
    params.append('x_address', address1 + (address2 ? ' ' + address2 : ''));
    params.append('x_city', city || '');
    params.append('x_state', state || '');
    params.append('x_zip', zip || '');
    params.append('x_country', country || '');
    params.append('x_phone', phoneNumber || '');
    params.append('x_email', email);
    params.append('x_invoice_num', `INV-${Date.now()}`); // Unique invoice number

            // Add line items with corrected format
            if (lineItems && lineItems.length > 0) {
              console.log('Line items being sent:', lineItems);
              lineItems.forEach((item, index) => {
                console.log(`Adding line item ${index + 1}:`, item);
                // Ensure proper format: <item_id>|<item_name>|<item_description>|<quantity>|<unit_price>|<taxable>
                params.append('x_line_item', item);
              });
            }

    // Send request to Authorize.net
    const response = await fetch(authorizeNetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const responseText = await response.text();
    const responseFields = responseText.split('|');

    const responseCode = responseFields[0]; // 1 = Approved, 2 = Declined, 3 = Error
    const responseReasonCode = responseFields[2];
    const responseReasonText = responseFields[3];
    const transactionId = responseFields[6];

    console.log('Authorize.net Response:', responseText);

    if (responseCode === '1') {
      return res.status(200).json({
        success: true,
        message: 'Payment successful',
        transactionId: transactionId,
        rawResponse: responseText
      });
    } else {
      console.error('Authorize.net Error:', responseReasonText, responseText);
      return res.status(400).json({
        success: false,
        error: responseReasonText || 'Payment declined',
        rawResponse: responseText
      });
    }

  } catch (error) {
    console.error('Error communicating with Authorize.net:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process payment due to a network error.',
      details: error.message
    });
  }
}
