import { Resend } from 'resend';

// Check if API key is available
if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY not found. Email functionality disabled.');
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { recipientEmail, subject, message, quoteData } = req.body;

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

    return res.status(200).json({ 
      success: true, 
      messageId: data.id 
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
  const { firstName, lastName, companyName, email, phone, address1, address2, city, state, zip, services, total } = quoteData;
  
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
            .services-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .services-table th, .services-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            .services-table th { background-color: #f8f9fa; font-weight: bold; }
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
                        <th>Description</th>
                        <th>Quantity</th>
                        <th>Unit Price</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
  `;

  // Add service rows
  services.forEach(service => {
    const serviceName = service.productName || 'Service';
    const description = service.description || '';
    const quantity = service.quantity || '1';
    const unitCost = service.unitCost || '0';
    const subtotal = service.subtotal || '0';
    
    html += `
      <tr>
        <td>${serviceName}</td>
        <td>${description}</td>
        <td>${quantity}</td>
        <td>$${parseFloat(unitCost).toFixed(2)}</td>
        <td>$${parseFloat(subtotal).toFixed(2)}</td>
      </tr>
    `;
  });

  html += `
                </tbody>
            </table>
            
            <div class="total-section">
                <div class="total-amount">Total: $${parseFloat(total).toFixed(2)}</div>
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
  const { firstName, lastName, companyName, email, phone, address1, address2, city, state, zip, services } = quoteData;
  
  // Base URL for the payment form
  const baseUrl = 'https://quote-tool-payment-form.vercel.app/payment-form.html';
  
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
  
  // Add services
  services.forEach((service, index) => {
    params.append(`productName${index}`, service.productName || '');
    params.append(`quantity${index}`, service.quantity || '1');
    params.append(`description${index}`, service.description || '');
    params.append(`unitCost${index}`, service.unitCost || '0');
    params.append(`subtotal${index}`, service.subtotal || '0');
  });
  
  return `${baseUrl}?${params.toString()}`;
}
