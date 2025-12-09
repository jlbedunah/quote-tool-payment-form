import { Resend } from 'resend';
import { findOrCreateContact, appendNoteToContact, addTagsToContact } from '../lib/gohighlevel.js';
import { supabase } from '../lib/supabase.js';
import { verifyAuth } from '../lib/auth-middleware.js';
import { notifyQuoteSent } from '../lib/slack-notifications.js';
import { randomUUID } from 'crypto';

// Check if API key is available
if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY not found. Email functionality disabled.');
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req, res) {
  // Check for protection bypass token OR authentication
  const bypassToken = req.headers['x-vercel-protection-bypass'];
  const expectedBypassToken = process.env.VERCEL_PROTECTION_BYPASS;
  const authHeader = req.headers.authorization;
  
  let user = null;
  
  // Try authentication first (but don't fail if it doesn't work - allow bypass token)
  if (authHeader) {
    try {
      // Use verifyAuth directly instead of requireAuth to avoid response issues
      const authResult = await verifyAuth(req);
      if (authResult && !authResult.error) {
        user = authResult.user;
      }
    } catch (error) {
      // Auth failed, try bypass token
      console.log('Auth check failed, trying bypass token');
    }
  }
  
  // If no auth, check bypass token
  if (!user && expectedBypassToken && bypassToken !== expectedBypassToken) {
    return res.status(401).json({ error: 'Unauthorized - Invalid bypass token or authentication required' });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { recipientEmail, subject, message, quoteData } = req.body;

    // Debug logging
    console.log('Email request received:', {
      recipientEmail,
      subject,
      message: message ? message.substring(0, 100) + '...' : 'No message',
      quoteDataKeys: quoteData ? Object.keys(quoteData) : 'No quoteData',
      servicesCount: quoteData?.services ? quoteData.services.length : 0,
      servicesSample: quoteData?.services ? quoteData.services[0] : 'No services',
      allServices: quoteData?.services ? quoteData.services : 'No services array'
    });

    // Validate required fields
    if (!recipientEmail || !quoteData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if Resend is configured
    if (!resend) {
      return res.status(500).json({ 
        success: false, 
        error: 'Email service not configured. Please add RESEND_API_KEY environment variable.' 
      });
    }

    // Generate email content
    const emailContent = generateEmailContent(quoteData, message);

    // Send email using Resend
    const data = await resend.emails.send({
      from: 'quotes@mybookkeepers.com',
      to: [recipientEmail],
      replyTo: 'jason@mybookkeepers.com',
      subject: subject || 'Your Quote Request',
      html: emailContent,
    });

    console.log('Email sent successfully:', data);

    // Generate payment link
    const paymentLink = generatePaymentLink(quoteData);

    // Save quote to database
    let savedQuote = null;
    if (supabase) {
      try {
        // Generate quote number using database function
        const { data: quoteNumberData, error: quoteNumberError } = await supabase
          .rpc('generate_quote_number');

        const quoteNumber = quoteNumberError ? `Q-${new Date().getFullYear()}-${Date.now()}` : quoteNumberData;

        // Prepare quote data for database
        const quoteToSave = {
          id: randomUUID(),
          quote_number: quoteNumber,
          status: 'emailed',
          customer_first_name: quoteData.firstName || '',
          customer_last_name: quoteData.lastName || '',
          customer_email: recipientEmail || quoteData.email || '',
          customer_phone: quoteData.phone || null,
          customer_company_name: quoteData.companyName || null,
          customer_address1: quoteData.address1 || null,
          customer_address2: quoteData.address2 || null,
          customer_city: quoteData.city || null,
          customer_state: quoteData.state || null,
          customer_zip: quoteData.zip || null,
          services: quoteData.services || [],
          totals: {
            one_time_total: parseFloat(quoteData.oneTimeTotal || quoteData.grandTotal || 0),
            subscription_monthly_total: parseFloat(quoteData.subscriptionMonthlyTotal || 0),
            grand_total: parseFloat(quoteData.grandTotal || quoteData.oneTimeTotal || 0)
          },
          delivery_method: 'email',
          payment_link: paymentLink,
          email_sent_at: new Date().toISOString(),
          email_recipient: recipientEmail,
          email_message_id: data.id,
          payment_status: 'pending',
          created_by_user_id: user?.id || null
        };

        const { data: savedQuoteData, error: saveError } = await supabase
          .from('quotes')
          .insert(quoteToSave)
          .select()
          .single();

        if (saveError) {
          console.error('Error saving quote to database:', saveError);
        } else {
          savedQuote = savedQuoteData;
          console.log('Quote saved to database:', savedQuote.id);
        }
      } catch (saveError) {
        console.error('Error saving quote:', saveError);
        // Don't fail the email send if quote save fails
      }
    }

    // Sync to GHL after email is sent successfully
    let ghlSyncResult = null;
    try {
      ghlSyncResult = await syncQuoteToGHL(quoteData, recipientEmail);
      console.log('GHL sync result:', ghlSyncResult);
    } catch (ghlError) {
      // Log GHL sync errors but don't fail the email send
      console.error('GHL sync failed (email still sent):', ghlError);
      ghlSyncResult = {
        success: false,
        error: ghlError.message
      };
    }

    // Send Slack notification for quote sent
    try {
      const customerName = quoteData.customerName || 
                          (quoteData.firstName && quoteData.lastName 
                            ? `${quoteData.firstName} ${quoteData.lastName}` 
                            : quoteData.firstName || quoteData.lastName || null);
      const totalAmount = quoteData.grandTotal || quoteData.oneTimeTotal || quoteData.totalAmount || quoteData.total || 0;
      const slackResult = await notifyQuoteSent({
        customerName,
        customerEmail: recipientEmail,
        totalAmount,
        services: quoteData.services || [],
        quoteNumber: savedQuote?.quote_number || null,
        quoteId: savedQuote?.id || null
      });
      if (slackResult.success) {
        console.log('Slack notification sent for quote');
      } else if (slackResult.skipped) {
        console.log('Slack notification skipped:', slackResult.reason);
      }
    } catch (slackError) {
      console.error('Error sending Slack notification (non-fatal):', slackError);
      // Don't fail the email send if Slack notification fails
    }

    return res.status(200).json({ 
      success: true, 
      messageId: data.id,
      quoteId: savedQuote?.id || null,
      ghlSync: ghlSyncResult
    });

  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

function generateEmailContent(quoteData, additionalMessage) {
  const {
    firstName,
    lastName,
    companyName,
    email,
    phone,
    address1,
    address2,
    city,
    state,
    zip,
    services,
    oneTimeTotal,
    subscriptionMonthlyTotal,
    grandTotal
  } = quoteData;

  const parsedOneTimeTotal = Number(parseFloat(oneTimeTotal ?? grandTotal ?? '0') || 0);
  const parsedSubscriptionTotal = Number(parseFloat(subscriptionMonthlyTotal ?? '0') || 0);
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Your Quote</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .customer-info { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .services-table { width: 100%; border-collapse: collapse; margin: 20px 0; table-layout: fixed; }
            .services-table th, .services-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; word-break: break-word; vertical-align: top; }
            .services-table th { background-color: #f8f9fa; font-weight: bold; }
            .services-table th:nth-child(1), .services-table td:nth-child(1) { width: 40%; }
            .services-table th:nth-child(2), .services-table td:nth-child(2) { width: 15%; }
            .services-table th:nth-child(3), .services-table td:nth-child(3) { width: 20%; }
            .services-table th:nth-child(4), .services-table td:nth-child(4) { width: 25%; text-align: right; }
            .total-section { background: #e3f2fd; padding: 20px; border-radius: 8px; text-align: right; margin-top: 20px; }
            .total-amount { font-size: 24px; font-weight: bold; color: #1976d2; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .cta-button { display: inline-block; background: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Your Quote Request</h1>
            <p>Thank you for your interest in our services</p>
        </div>
        
        <div class="content">
            <div class="customer-info">
                <h2>Customer Information</h2>
                <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                ${companyName ? `<p><strong>Company:</strong> ${companyName}</p>` : ''}
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Address:</strong> ${address1}${address2 ? ', ' + address2 : ''}, ${city}, ${state} ${zip}</p>
            </div>
            
            <h2>Services Requested</h2>
            <table class="services-table">
                <thead>
                    <tr>
                        <th>Service</th>
                        <th>Quantity</th>
                        <th>Unit Price</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
  `;

  // Add service rows
  if (services && services.length > 0) {
    console.log('Processing services for email:', services);
    services.forEach((service, index) => {
      // Handle field names with index (productName0, productName1, etc.)
      const serviceName = service[`productName${index}`] || service.productName || 'Service';
      const description = service[`description${index}`] || service.description || '';
      const quantity = service[`quantity${index}`] || service.quantity || '1';
      const unitCost = service[`unitCost${index}`] || service.unitCost || '0';
      const isSubscription = service[`isSubscription${index}`] === 'true' || service.isSubscription === 'true';
      const interval = service[`subscriptionInterval${index}`] || service.subscriptionInterval || 'monthly';
      
      const unitCostNumber = parseFloat(unitCost) || 0;
      const subtotalRaw = service[`subtotal${index}`] || service.subtotal;
      const subtotalNumber = subtotalRaw !== undefined ? parseFloat(subtotalRaw) || 0 : unitCostNumber * (parseFloat(quantity) || 1);
      
      console.log(`Service ${index}:`, {
        serviceName,
        description,
        quantity,
        unitCost,
        subtotal: subtotalNumber,
        rawService: service
      });
      
      html += `
        <tr>
          <td>${serviceName}${isSubscription ? '<span style="color:#7b1fa2; font-size:12px; margin-left:6px;">(Subscription)</span>' : ''}</td>
          <td>${quantity}</td>
          <td>$${unitCostNumber.toFixed(2)}${isSubscription ? ' / month' : ''}</td>
          <td style="text-align:right;">$${subtotalNumber.toFixed(2)}</td>
        </tr>
      `;
    });
  } else {
    console.log('No services found for email');
    html += `
      <tr>
        <td colspan="5" style="text-align: center; color: #666;">No services specified</td>
      </tr>
    `;
  }

  html += `
                </tbody>
            </table>
            
            <div class="total-section">
                <div style="font-size:16px; color:#555; text-align:right;">Due Today</div>
                <div class="total-amount">$${parsedOneTimeTotal.toFixed(2)}</div>
                ${parsedSubscriptionTotal > 0 ? `<div style="margin-top:8px; font-size:15px; color:#333; text-align:right;">Monthly Subscription: <strong>$${parsedSubscriptionTotal.toFixed(2)}</strong></div>` : ''}
            </div>
            
            ${additionalMessage ? `
            <div style="background: white; padding: 20px; border-radius: 8px; margin-top: 20px;">
                <h3>Additional Notes</h3>
                <p>${additionalMessage.replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="${generatePaymentLink(quoteData)}" class="cta-button">Proceed to Payment</a>
            </div>
            
            <div class="footer">
                <p>This quote is valid for 30 days from the date of issue.</p>
                <p>If you have any questions, please don't hesitate to contact us.</p>
            </div>
        </div>
    </body>
    </html>
  `;

  return html;
}

function generatePaymentLink(quoteData) {
  const {
    firstName,
    lastName,
    companyName,
    email,
    phone,
    address1,
    address2,
    city,
    state,
    zip,
    services,
    oneTimeTotal,
    subscriptionMonthlyTotal,
    grandTotal
  } = quoteData;
  
  // Detect environment (dev vs production)
  // In dev: NODE_ENV is not 'production' and we're likely running on localhost
  // In production: NODE_ENV is 'production' or VERCEL_ENV is 'production'
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  
  // Use localhost for dev, production URL for production
  const baseUrl = isProduction 
    ? 'https://quotes.mybookkeepers.com/payment-form-robust.html'
    : 'http://localhost:3000/payment-form-robust.html';
  
  console.log('Payment link environment:', isProduction ? 'PRODUCTION' : 'DEV');
  console.log('Payment link URL:', baseUrl);
  
  // Build query parameters
  const params = new URLSearchParams();
  
  // Add customer information
  params.append('firstName', firstName || '');
  params.append('lastName', lastName || '');
  params.append('companyName', companyName || '');
  params.append('email', email || '');
  params.append('phone', phone || '');
  params.append('address1', address1 || '');
  params.append('address2', address2 || '');
  params.append('city', city || '');
  params.append('state', state || '');
  params.append('zip', zip || '');
  if (oneTimeTotal !== undefined) {
    params.append('oneTimeTotal', oneTimeTotal ?? grandTotal ?? '0');
  }
  if (subscriptionMonthlyTotal !== undefined) {
    params.append('subscriptionMonthlyTotal', subscriptionMonthlyTotal || '0');
  }
  
  // Add services
  if (services && services.length > 0) {
    services.forEach((service, index) => {
      // Handle field names with index (productName0, productName1, etc.)
      const serviceName = service[`productName${index}`] || service.productName || '';
      const description = service[`description${index}`] || service.description || '';
      const quantity = service[`quantity${index}`] || service.quantity || '1';
      const unitCost = service[`unitCost${index}`] || service.unitCost || '0';
      const subtotal = service[`subtotal${index}`] || service.subtotal || (parseFloat(quantity) * parseFloat(unitCost)).toFixed(2);
      
      params.append(`productName${index}`, serviceName);
      params.append(`quantity${index}`, quantity);
      params.append(`description${index}`, description);
      const isSubscription = service[`isSubscription${index}`] === 'true' || service.isSubscription === 'true';
      const interval = service[`subscriptionInterval${index}`] || service.subscriptionInterval || 'monthly';
      
      params.append(`unitCost${index}`, unitCost);
      params.append(`subtotal${index}`, subtotal);
      if (isSubscription) {
        params.append(`isSubscription${index}`, 'true');
        if (interval) {
          params.append(`subscriptionInterval${index}`, interval);
        }
      }
    });
  }
  
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Sync quote email to GoHighLevel
 * - Find or create contact by email
 * - Tag with "email-quote-sent"
 * - Add note with quote details and payment link
 */
async function syncQuoteToGHL(quoteData, recipientEmail) {
  const {
    firstName,
    lastName,
    companyName,
    email,
    phone,
    address1,
    address2,
    city,
    state,
    zip,
    services,
    oneTimeTotal,
    subscriptionMonthlyTotal,
    grandTotal,
    internalComment
  } = quoteData;

  // Use recipientEmail from the email being sent (may differ from quoteData.email)
  const contactEmail = recipientEmail?.toLowerCase() || email?.toLowerCase();

  if (!contactEmail) {
    throw new Error('Email is required to sync quote to GHL');
  }

  // Find or create contact
  const contact = await findOrCreateContact({
    email: contactEmail,
    firstName,
    lastName,
    company: companyName,
    phone,
    address: {
      line1: address1,
      line2: address2,
      city,
      state,
      postalCode: zip,
      country: 'US'
    }
  });

  if (!contact || !contact.id) {
    throw new Error('Failed to find or create GHL contact');
  }

  const contactId = contact.id;

  // Generate payment link
  const paymentLink = generatePaymentLink(quoteData);

  // Build quote details for note
  const parsedOneTimeTotal = Number(parseFloat(oneTimeTotal ?? grandTotal ?? '0') || 0);
  const parsedSubscriptionTotal = Number(parseFloat(subscriptionMonthlyTotal ?? '0') || 0);

  // Build services list
  let servicesText = '';
  if (services && services.length > 0) {
    services.forEach((service, index) => {
      const serviceName = service[`productName${index}`] || service.productName || 'Service';
      const description = service[`description${index}`] || service.description || '';
      const quantity = service[`quantity${index}`] || service.quantity || '1';
      const unitCost = service[`unitCost${index}`] || service.unitCost || '0';
      const subtotalRaw = service[`subtotal${index}`] || service.subtotal;
      const unitCostNumber = parseFloat(unitCost) || 0;
      const subtotalNumber = subtotalRaw !== undefined ? parseFloat(subtotalRaw) || 0 : unitCostNumber * (parseFloat(quantity) || 1);
      const isSubscription = service[`isSubscription${index}`] === 'true' || service.isSubscription === 'true';
      
      servicesText += `\n• ${serviceName}`;
      if (description) {
        servicesText += ` - ${description}`;
      }
      servicesText += ` (Qty: ${quantity} × $${unitCostNumber.toFixed(2)})`;
      if (isSubscription) {
        servicesText += ' [Subscription]';
      }
      servicesText += ` = $${subtotalNumber.toFixed(2)}`;
    });
  }

  // Build note body
  const noteBody = `📧 Quote Email Sent

Quote sent to: ${contactEmail}
Date: ${new Date().toLocaleString()}

Customer Information:
${firstName || ''} ${lastName || ''}${companyName ? `\nCompany: ${companyName}` : ''}${phone ? `\nPhone: ${phone}` : ''}
${address1 || ''}${address2 ? `, ${address2}` : ''}${city ? `\n${city}` : ''}${state ? `, ${state}` : ''} ${zip || ''}

Services:${servicesText || '\nNo services specified'}

Totals:
One-Time Total: $${parsedOneTimeTotal.toFixed(2)}${parsedSubscriptionTotal > 0 ? `\nMonthly Subscription: $${parsedSubscriptionTotal.toFixed(2)}` : ''}

Payment Link:
${paymentLink}`;

  // Add note to contact
  await appendNoteToContact(contactId, noteBody);

  // Add tags: specific tag for email quotes + generic tag for all quotes
  await addTagsToContact(contactId, ['email-quote-sent', 'quote-created']);

  return {
    success: true,
    contactId,
    contactEmail
  };
}
