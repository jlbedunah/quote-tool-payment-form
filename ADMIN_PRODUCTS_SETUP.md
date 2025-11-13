# Admin Product Management System

## Overview

The Admin Product Management System allows you to manage products and services without editing code. Products are stored in `data/products.json` and can be managed through the admin dashboard.

## Features

- **View Products**: See all products in a table format
- **Add Products**: Create new products with name, description, price, category, and subscription settings
- **Edit Products**: Update existing products
- **Delete Products**: Deactivate products (soft delete)
- **Product Validation**: Enforces Authorize.net limits (name: 31 chars, description: 255 chars)

## Accessing the Admin Dashboard

1. Open `admin-products.html` in your browser (or navigate to `/admin-products.html` on your deployed site)
2. You'll see a table of all products
3. Click "Add Product" to create a new product
4. Click "Edit" on any product to modify it
5. Click "Delete" on any product to deactivate it

## Product Schema

```json
{
  "id": "product-id",
  "name": "Product Name",  // Max 31 characters (Authorize.net limit)
  "description": "Product description",  // Max 255 characters (Authorize.net limit)
  "unitPrice": 2.19,  // Decimal number
  "category": "Bookkeeping",  // Optional, for organization only
  "isSubscription": false,  // Boolean
  "subscriptionInterval": null,  // "monthly" | "quarterly" | "weekly" | "biweekly" | "annually" | null
  "isActive": true,  // Boolean
  "createdAt": "2025-01-15T00:00:00.000Z",
  "updatedAt": "2025-01-15T00:00:00.000Z"
}
```

## Current Limitations

### File-Based Storage (Development)

- **Reads**: Works in all environments (local dev and production)
- **Writes**: Only works in local development
- **Production**: File writes don't persist on Vercel (read-only filesystem)

### Production Database Requirement

For production use, you need to integrate a database. The current file-based approach works for reads but writes won't persist on Vercel.

**Recommended Database Options:**

1. **Vercel KV** (Redis) - Easy integration with Vercel
2. **Supabase** (PostgreSQL) - Free tier available
3. **MongoDB Atlas** - Free tier available
4. **PlanetScale** (MySQL) - Free tier available

## How It Works

### Quote Tool Integration

1. The quote tool (`quote-tool.html`) loads products from `/api/products` on page load
2. Products are dynamically populated in the service dropdowns
3. When a product is selected, it auto-populates:
   - Product name
   - Unit price
   - Description (if available)
   - Subscription settings (if applicable)

### API Endpoints

- `GET /api/products` - List all active products
- `GET /api/products?includeInactive=true` - List all products (including inactive)
- `POST /api/products` - Create a new product
- `PUT /api/products?id={productId}` - Update a product
- `DELETE /api/products?id={productId}` - Deactivate a product

## Adding a Database (Production)

### Option 1: Vercel KV (Recommended)

1. Install Vercel KV:
   ```bash
   npm install @vercel/kv
   ```

2. Create a KV database in Vercel dashboard

3. Update `api/products.js` to use Vercel KV:
   ```javascript
   import { kv } from '@vercel/kv';
   
   async function readProducts() {
     const products = await kv.get('products') || [];
     return { products };
   }
   
   async function writeProducts(data) {
     await kv.set('products', data.products);
     return true;
   }
   ```

### Option 2: Supabase

1. Create a Supabase project
2. Create a `products` table
3. Install Supabase client:
   ```bash
   npm install @supabase/supabase-js
   ```
4. Update `api/products.js` to use Supabase

### Option 3: MongoDB Atlas

1. Create a MongoDB Atlas account
2. Create a database and collection
3. Install MongoDB driver:
   ```bash
   npm install mongodb
   ```
4. Update `api/products.js` to use MongoDB

## Temporary Workaround (Until Database is Added)

For now, if you need to update products in production:

1. Edit `data/products.json` locally
2. Commit and push to git
3. Vercel will redeploy with the updated products

The quote tool will automatically use the updated products after redeployment.

## Security Considerations

**Current Status**: The admin dashboard has no authentication. Anyone with the URL can access it.

**Recommended**: Add authentication before deploying to production:

1. **Vercel Protection**: Use Vercel's password protection
2. **API Key**: Add an API key requirement for write operations
3. **OAuth**: Implement OAuth authentication (Google, GitHub, etc.)
4. **Custom Auth**: Build a custom authentication system

## Testing

1. **Local Development**:
   ```bash
   vercel dev
   ```
   - Navigate to `http://localhost:3000/admin-products.html`
   - Test creating, editing, and deleting products
   - Verify products appear in the quote tool

2. **Production**:
   - Deploy to Vercel
   - Test that products load correctly
   - Note: Writes won't persist until database is added

## Next Steps

1. ✅ Create product data structure
2. ✅ Create API endpoints
3. ✅ Create admin dashboard
4. ✅ Integrate with quote tool
5. ⏳ Add database integration (for production writes)
6. ⏳ Add authentication/security
7. ⏳ Add bulk import/export (CSV)
8. ⏳ Add product search and filtering

## Support

For issues or questions, check the Vercel logs:
```bash
vercel logs
```

Or check the browser console for errors when using the admin dashboard.

