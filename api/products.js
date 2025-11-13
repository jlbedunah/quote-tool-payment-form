import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCTS_FILE = path.join(__dirname, '../data/products.json');

// Helper function to read products
function readProducts() {
  try {
    const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading products file:', error);
    return { products: [] };
  }
}

// Helper function to write products
// NOTE: On Vercel, the filesystem is read-only, so writes won't persist in production
// For production, you need to use a database (Vercel KV, Supabase, MongoDB, etc.)
// This function will work in local development but not on Vercel
function writeProducts(data) {
  try {
    // In Vercel, we can't write to files - return false
    // In local dev, try to write to the file
    if (process.env.VERCEL === '1') {
      console.warn('⚠️ File writes not supported in Vercel production. Product writes will not persist.');
      console.warn('💡 To enable product management in production, integrate a database:');
      console.warn('   - Vercel KV (Redis)');
      console.warn('   - Supabase (PostgreSQL)');
      console.warn('   - MongoDB Atlas');
      console.warn('   - Or another database service');
      // Return success for now so the API doesn't error, but warn that it won't persist
      // In production, the file will need to be updated via git commits
      return false;
    }

    // Local development - try to write to file
    try {
      fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (writeError) {
      console.error('Error writing products file:', writeError);
      return false;
    }
  } catch (error) {
    console.error('Error in writeProducts:', error);
    return false;
  }
}

// Generate ID from name
function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Validate product data
function validateProduct(product, isUpdate = false) {
  const errors = [];

  if (!isUpdate && !product.name) {
    errors.push('Product name is required');
  }
  
  if (product.name && product.name.length > 31) {
    errors.push('Product name must be 31 characters or less (Authorize.net limit)');
  }

  if (product.description && product.description.length > 255) {
    errors.push('Product description must be 255 characters or less (Authorize.net limit)');
  }

  if (product.unitPrice === undefined || product.unitPrice === null) {
    errors.push('Unit price is required');
  } else if (typeof product.unitPrice !== 'number' || product.unitPrice < 0) {
    errors.push('Unit price must be a positive number');
  }

  if (product.isSubscription === undefined) {
    errors.push('isSubscription is required');
  }

  if (product.isSubscription === true) {
    if (!product.subscriptionInterval) {
      errors.push('subscriptionInterval is required for subscription products');
    } else if (!['monthly', 'quarterly', 'weekly', 'biweekly', 'annually'].includes(product.subscriptionInterval)) {
      errors.push('subscriptionInterval must be one of: monthly, quarterly, weekly, biweekly, annually');
    }
  } else {
    product.subscriptionInterval = null;
  }

  if (product.isActive === undefined) {
    product.isActive = true;
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { products } = readProducts();

    // GET - List products
    if (req.method === 'GET') {
      const { includeInactive } = req.query;
      
      let filteredProducts = products;
      if (includeInactive !== 'true') {
        filteredProducts = products.filter(p => p.isActive !== false);
      }

      return res.status(200).json({
        success: true,
        products: filteredProducts
      });
    }

    // POST - Create product
    if (req.method === 'POST') {
      const newProduct = req.body;

      // Generate ID if not provided
      if (!newProduct.id) {
        newProduct.id = generateId(newProduct.name);
      }

      // Check if ID already exists
      if (products.find(p => p.id === newProduct.id)) {
        return res.status(400).json({
          success: false,
          error: 'Product with this ID already exists'
        });
      }

      // Validate product
      const validation = validateProduct(newProduct);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors
        });
      }

      // Add timestamps
      const now = new Date().toISOString();
      newProduct.createdAt = now;
      newProduct.updatedAt = now;

      // Add to products array
      products.push(newProduct);

      // Write to file
      if (writeProducts({ products })) {
        return res.status(201).json({
          success: true,
          product: newProduct
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Failed to save product'
        });
      }
    }

    // PUT - Update product
    if (req.method === 'PUT') {
      // Get ID from query string or URL path
      const id = req.query?.id || req.url?.split('?')[1]?.split('&').find(p => p.startsWith('id='))?.split('=')[1];
      const updatedProduct = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Product ID is required'
        });
      }

      const productIndex = products.findIndex(p => p.id === id);
      if (productIndex === -1) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      const existingProduct = products[productIndex];
      
      // Merge updates with existing product
      const mergedProduct = {
        ...existingProduct,
        ...updatedProduct,
        id: existingProduct.id, // Don't allow ID changes
        createdAt: existingProduct.createdAt, // Don't allow createdAt changes
        updatedAt: new Date().toISOString()
      };

      // Validate product
      const validation = validateProduct(mergedProduct, true);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors
        });
      }

      // Update product
      products[productIndex] = mergedProduct;

      // Write to file
      if (writeProducts({ products })) {
        return res.status(200).json({
          success: true,
          product: mergedProduct
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Failed to update product'
        });
      }
    }

    // DELETE - Delete/Deactivate product
    if (req.method === 'DELETE') {
      // Get ID from query string or URL path
      const id = req.query?.id || req.url?.split('?')[1]?.split('&').find(p => p.startsWith('id='))?.split('=')[1];

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Product ID is required'
        });
      }

      const productIndex = products.findIndex(p => p.id === id);
      if (productIndex === -1) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      // Soft delete - set isActive to false
      products[productIndex].isActive = false;
      products[productIndex].updatedAt = new Date().toISOString();

      // Write to file
      if (writeProducts({ products })) {
        return res.status(200).json({
          success: true,
          message: 'Product deactivated successfully'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Failed to delete product'
        });
      }
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('Error in products API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}

