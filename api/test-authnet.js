export default function handler(req, res) {
  // Only allow GET requests for testing
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if environment variables are available
  const loginId = process.env.AUTHORIZE_NET_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;

  if (!loginId || !transactionKey) {
    return res.status(500).json({ 
      error: 'Authorize.net credentials not configured',
      loginIdPresent: !!loginId,
      transactionKeyPresent: !!transactionKey
    });
  }

  // Return success (don't expose the actual keys)
  return res.status(200).json({ 
    success: true,
    message: 'Authorize.net credentials are configured',
    loginIdLength: loginId.length,
    transactionKeyLength: transactionKey.length
  });
}

