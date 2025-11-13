# Quote Tool & Payment Form

A complete quote generation and payment processing system built with HTML, CSS (Tailwind), and JavaScript.

## Features

### Quote Tool (`quote-tool.html`)
- **Customer Information Management** - Complete contact and address details
- **Service Selection** - Searchable dropdown with predefined services
- **Dynamic Pricing** - Auto-populated pricing for services
- **Multiple Services** - Add unlimited service rows
- **Auto-calculation** - Real-time subtotal and total calculations
- **Link Generation** - Creates shareable URLs for payment processing

### Payment Form (`payment-form.html`)
- **Authorize.net Integration** - Direct payment processing
- **URL Pre-population** - Auto-fills from quote tool links
- **Service Line Items** - Detailed tracking for Hyros analytics
- **Form Validation** - Client-side validation before submission
- **Responsive Design** - Works on all devices

## Services Included

Products are now managed through the Admin Product Management System. See [ADMIN_PRODUCTS_SETUP.md](./ADMIN_PRODUCTS_SETUP.md) for details.

Default products:
- **Catch-up Bookkeeping** - $2.19
- **Tax Return (LLC)** - $1.99
- **Tax Return (S-Corp)** - $2.01
- **Monthly Bookkeeping Subscription** - $2.19 (monthly subscription)

## Setup

### 1. Clone the Repository
```bash
git clone [your-repo-url]
cd quote-tool-payment-form
```

### 2. Configure Authorize.net
Update the following fields in `payment-form.html`:
```html
<input type="hidden" name="x_login" value="YOUR_API_LOGIN_ID">
<input type="hidden" name="x_tran_key" value="YOUR_TRANSACTION_KEY">
```

### 3. Deploy to Vercel
1. Connect your GitHub repository to Vercel
2. Deploy automatically on push
3. Configure environment variables if needed

## Usage

1. **Create Quote**: Use `quote-tool.html` to generate quotes
2. **Build Link**: Click "Build Link" to create payment URL
3. **Share**: Send the generated link to customers
4. **Payment**: Customers complete payment via `payment-form.html`
5. **Tracking**: Hyros receives detailed line item data

## Technology Stack

- **Frontend**: HTML5, CSS3 (Tailwind), JavaScript (ES6+)
- **Payment Processing**: Authorize.net
- **Analytics**: Hyros integration via line items
- **Deployment**: Vercel

## Admin Product Management

Manage products and services without editing code:

1. **Admin Dashboard**: Access `admin-products.html` to manage products
2. **Product API**: Products are loaded from `/api/products`
3. **Quote Tool Integration**: Products automatically appear in the quote tool dropdowns

See [ADMIN_PRODUCTS_SETUP.md](./ADMIN_PRODUCTS_SETUP.md) for detailed documentation.

**Note**: For production, you'll need to integrate a database (Vercel KV, Supabase, MongoDB, etc.) for write operations. See the admin setup documentation for details.

## File Structure

```
/
├── quote-tool.html          # Quote generation tool
├── payment-form-robust.html # Payment processing form
├── admin-products.html      # Admin product management dashboard
├── api/
│   ├── products.js          # Product management API
│   ├── process-payment-server.js  # Payment processing
│   └── send-quote-email.js  # Email quote functionality
├── data/
│   └── products.json        # Product data (read-only in production)
├── lib/
│   ├── authorize-net-env.js # Authorize.net configuration
│   ├── authorize-net-sync.js # GHL sync functionality
│   └── gohighlevel.js       # GHL API client
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## Security Notes

- Never commit API keys to version control
- Use environment variables for sensitive data
- Ensure HTTPS in production
- Validate all form inputs server-side
