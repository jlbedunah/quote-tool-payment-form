import { findOrCreateContact, addTagsToContact } from '../lib/gohighlevel.js';

/**
 * Manual tag contact API endpoint
 * 
 * This endpoint allows manually adding tags to a GoHighLevel contact by email.
 * Useful for fixing cases where webhooks didn't fire or tags weren't added.
 * 
 * Usage:
 * POST /api/manual-tag-contact
 * {
 *   "email": "debbie.green@bringinginthegreen.com",
 *   "tags": ["subscription-created", "monthly-bookkeeping-subscription"]
 * }
 */
export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, tags } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        if (!tags || !Array.isArray(tags) || tags.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Tags array is required and must not be empty'
            });
        }

        console.log('Manual tag request:', { email, tags });

        // Find or create contact
        const contact = await findOrCreateContact({
            email: email.toLowerCase().trim()
        });

        if (!contact || !contact.id) {
            return res.status(500).json({
                success: false,
                error: 'Failed to find or create contact'
            });
        }

        const contactId = contact.id;
        console.log('Contact found/created:', { contactId, email: contact.email });

        // Add tags
        const tagResult = await addTagsToContact(contactId, tags);

        console.log('Tags added successfully:', { contactId, tags, result: tagResult });

        return res.status(200).json({
            success: true,
            message: 'Tags added successfully',
            contact: {
                id: contactId,
                email: contact.email,
                name: contact.name || contact.firstName || contact.lastName
            },
            tagsAdded: tags
        });

    } catch (error) {
        console.error('Error in manual-tag-contact API:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
}


