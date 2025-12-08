import { supabase } from '../lib/supabase.js';
import { verifyAuth } from '../lib/auth-middleware.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  try {
    const authResult = await verifyAuth(req);
    if (authResult?.error || !authResult?.user) {
      return res.status(401).json({ error: 'Unauthorized - Authentication required' });
    }
  } catch (authError) {
    return res.status(401).json({ error: 'Unauthorized', details: authError.message });
  }

  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get total counts
    const [total24h, total7d, total30d, errors24h] = await Promise.all([
      supabase
        .from('application_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', dayAgo.toISOString()),
      supabase
        .from('application_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString()),
      supabase
        .from('application_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthAgo.toISOString()),
      supabase
        .from('application_logs')
        .select('id', { count: 'exact', head: true })
        .eq('level', 'error')
        .gte('created_at', dayAgo.toISOString())
    ]);

    // Get top sources (last 7 days)
    const { data: topSourcesData } = await supabase
      .from('application_logs')
      .select('source')
      .gte('created_at', weekAgo.toISOString());

    // Count sources
    const sourceCounts = {};
    if (topSourcesData) {
      topSourcesData.forEach(log => {
        sourceCounts[log.source] = (sourceCounts[log.source] || 0) + 1;
      });
    }

    const topSources = Object.entries(sourceCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    return res.status(200).json({
      total24h: total24h.count || 0,
      total7d: total7d.count || 0,
      total30d: total30d.count || 0,
      errors24h: errors24h.count || 0,
      topSources
    });

  } catch (error) {
    console.error('Error fetching log stats:', error);
    return res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
}

