import { supabase } from '../lib/supabase.js';
import { verifyAuth } from '../lib/auth-middleware.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication for accessing logs
  try {
    const authResult = await verifyAuth(req);
    if (authResult?.error || !authResult?.user) {
      return res.status(401).json({ error: 'Unauthorized - Authentication required' });
    }

    // Check if user is admin (optional - adjust based on your auth setup)
    // For now, any authenticated user can view logs
    // You can add role checking here if needed:
    // if (authResult.user.role !== 'admin') {
    //   return res.status(403).json({ error: 'Forbidden - Admin access required' });
    // }
  } catch (authError) {
    return res.status(401).json({ error: 'Unauthorized', details: authError.message });
  }

  try {
    const {
      startDate,
      endDate,
      level,
      source,
      email,
      transactionId,
      contactId,
      quoteId,
      search,
      environment,
      page = '1',
      limit = '50'
    } = req.query;

    // Build Supabase query
    let query = supabase
      .from('application_logs')
      .select('*', { count: 'exact' });

    // Date range filter
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Level filter (can be array or single value)
    if (level) {
      const levels = Array.isArray(level) ? level : [level];
      query = query.in('level', levels);
    }

    // Source filter
    if (source) {
      query = query.eq('source', source);
    }

    // Environment filter
    if (environment && environment !== 'all') {
      query = query.eq('environment', environment);
    }

    // Metadata filters (JSONB queries)
    if (email) {
      query = query.eq('metadata->>email', email);
    }
    if (transactionId) {
      query = query.eq('metadata->>transactionId', transactionId);
    }
    if (contactId) {
      query = query.eq('metadata->>contactId', contactId);
    }
    if (quoteId) {
      query = query.eq('metadata->>quoteId', quoteId);
    }

    // Full-text search on message
    if (search) {
      query = query.textSearch('message', search, {
        type: 'websearch',
        config: 'english'
      });
    }

    // Order by created_at descending (newest first)
    query = query.order('created_at', { ascending: false });

    // Pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    // Execute query
    const { data: logs, error, count } = await query;

    if (error) {
      console.error('Error fetching logs:', error);
      return res.status(500).json({ error: 'Failed to fetch logs', details: error.message });
    }

    // Format response
    return res.status(200).json({
      logs: logs || [],
      total: count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((count || 0) / limitNum)
    });

  } catch (error) {
    console.error('Error in logs API:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

