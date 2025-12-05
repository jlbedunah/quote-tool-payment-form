import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCTS_FILE = path.join(__dirname, '../data/products.json');

// Helper function to convert database row (snake_case) to API format (camelCase)
function dbRowToProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unitPrice: parseFloat(row.unit_price),
    category: row.category,
    isSubscription: row.is_subscription,
    subscriptionInterval: row.subscription_interval,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Helper function to convert API format (camelCase) to database row (snake_case)
function productToDbRow(product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description || null,
    unit_price: product.unitPrice,
    category: product.category || null,
    is_subscription: product.isSubscription,
    subscription_interval: product.subscriptionInterval || null,
    is_active: product.isActive !== false
  };
}

// Helper function to read products from Supabase or fallback to file
async function readProducts() {
  // Try Supabase first if configured
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error reading products from Supabase:', error);
        // Fall back to file if Supabase fails
        return readProductsFromFile();
      }

      return {
        products: data.map(dbRowToProduct)
      };
    } catch (error) {
      console.error('Error reading products from Supabase:', error);
      // Fall back to file if Supabase fails
      return readProductsFromFile();
    }
  }

  // Fall back to file-based storage
  return readProductsFromFile();
}

// Helper function to read products from file (fallback)
function readProductsFromFile() {
  try {
    const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading products file:', error);
    return { products: [] };
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
    const { products } = await readProducts();

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

      // Save to Supabase or file
      if (isSupabaseConfigured()) {
        try {
          const dbRow = productToDbRow(newProduct);
          const { data, error } = await supabase
            .from('products')
            .insert([dbRow])
            .select()
            .single();

          if (error) {
            console.error('Error creating product in Supabase:', error);
            return res.status(500).json({
              success: false,
              error: 'Failed to save product: ' + error.message
            });
          }

          return res.status(201).json({
            success: true,
            product: dbRowToProduct(data)
          });
        } catch (error) {
          console.error('Error creating product:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to save product: ' + error.message
          });
        }
      } else {
        // Fallback to file-based storage
        products.push(newProduct);
        try {
          fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products }, null, 2), 'utf8');
          return res.status(201).json({
            success: true,
            product: newProduct
          });
        } catch (error) {
          console.error('Error writing products file:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to save product'
          });
        }
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

      const existingProduct = products.find(p => p.id === id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }
      
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

      // Update in Supabase or file
      if (isSupabaseConfigured()) {
        try {
          const dbRow = productToDbRow(mergedProduct);
          // Remove id, created_at from update (they shouldn't change)
          const { id: _, created_at: __, ...updateData } = dbRow;
          
          const { data, error } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

          if (error) {
            console.error('Error updating product in Supabase:', error);
            return res.status(500).json({
              success: false,
              error: 'Failed to update product: ' + error.message
            });
          }

          return res.status(200).json({
            success: true,
            product: dbRowToProduct(data)
          });
        } catch (error) {
          console.error('Error updating product:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to update product: ' + error.message
          });
        }
      } else {
        // Fallback to file-based storage
        const productIndex = products.findIndex(p => p.id === id);
        products[productIndex] = mergedProduct;
        try {
          fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products }, null, 2), 'utf8');
          return res.status(200).json({
            success: true,
            product: mergedProduct
          });
        } catch (error) {
          console.error('Error writing products file:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to update product'
          });
        }
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

      const existingProduct = products.find(p => p.id === id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      // Soft delete - set isActive to false
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase
            .from('products')
            .update({ is_active: false })
            .eq('id', id)
            .select()
            .single();

          if (error) {
            console.error('Error deactivating product in Supabase:', error);
            return res.status(500).json({
              success: false,
              error: 'Failed to delete product: ' + error.message
            });
          }

          return res.status(200).json({
            success: true,
            message: 'Product deactivated successfully'
          });
        } catch (error) {
          console.error('Error deactivating product:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to delete product: ' + error.message
          });
        }
      } else {
        // Fallback to file-based storage
        const productIndex = products.findIndex(p => p.id === id);
        products[productIndex].isActive = false;
        products[productIndex].updatedAt = new Date().toISOString();
        try {
          fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products }, null, 2), 'utf8');
          return res.status(200).json({
            success: true,
            message: 'Product deactivated successfully'
          });
        } catch (error) {
          console.error('Error writing products file:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to delete product'
          });
        }
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

