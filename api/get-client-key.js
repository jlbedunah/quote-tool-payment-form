export default async function handler(req, res) {
    // Check for protection bypass token
    const bypassToken = req.headers['x-vercel-protection-bypass'];
    const expectedBypassToken = process.env.VERCEL_PROTECTION_BYPASS;
    
    if (expectedBypassToken && bypassToken !== expectedBypassToken) {
        return res.status(401).json({ error: 'Unauthorized - Invalid bypass token' });
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const clientKey = process.env.AUTHORIZE_NET_CLIENT_KEY;
    const apiLoginID = process.env.AUTHORIZE_NET_LOGIN_ID;

    console.log('Client Key available:', !!clientKey);
    console.log('Client Key length:', clientKey ? clientKey.length : 0);
    console.log('Client Key preview:', clientKey ? clientKey.substring(0, 4) + '****' : 'MISSING');
    console.log('API Login ID available:', !!apiLoginID);
    console.log('API Login ID preview:', apiLoginID ? apiLoginID.substring(0, 4) + '****' : 'MISSING');

    if (!clientKey || !apiLoginID) {
        return res.status(500).json({ 
            error: 'Client Key or API Login ID not configured',
            clientKey: !!clientKey,
            apiLoginID: !!apiLoginID
        });
    }

    // Return the credentials (Client Key is safe to expose to frontend)
    return res.status(200).json({
        clientKey: clientKey,
        apiLoginID: apiLoginID
    });
}
