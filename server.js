import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3000;
const PUBLIC_DIR = join(__dirname, 'public');

// Check if SSL certificates exist
const certPath = join(__dirname, 'localhost.pem');
const keyPath = join(__dirname, 'localhost-key.pem');

const certExists = fs.existsSync(certPath);
const keyExists = fs.existsSync(keyPath);

if (certExists && keyExists) {
    // HTTPS server
    const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };

    const server = https.createServer(options, (req, res) => {
        serveStatic(req, res);
    });

    server.listen(PORT, () => {
        console.log(`✅ HTTPS server running at https://localhost:${PORT}`);
        console.log(`📁 Serving files from: ${PUBLIC_DIR}`);
    });
} else {
    // Fallback to HTTP if certificates don't exist
    console.warn('⚠️  SSL certificates not found. Running HTTP server.');
    console.warn('   To enable HTTPS, run: mkcert localhost 127.0.0.1 ::1');
    
    const server = createServer((req, res) => {
        serveStatic(req, res);
    });

    server.listen(PORT, () => {
        console.log(`✅ HTTP server running at http://localhost:${PORT}`);
        console.log(`📁 Serving files from: ${PUBLIC_DIR}`);
    });
}

function serveStatic(req, res) {
    // Handle API routes (proxy to Vercel dev server if running)
    if (req.url.startsWith('/api/')) {
        // For API routes, you might want to proxy to Vercel dev server
        // For now, return 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('API routes not available in static server. Use Vercel dev server.');
        return;
    }
    
    // Remove query string and normalize path
    let urlPath = req.url.split('?')[0];
    
    // Handle root path
    if (urlPath === '/') {
        urlPath = '/index.html';
    }
    
    // Remove leading slash for path joining
    const relativePath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
    let filePath = join(PUBLIC_DIR, relativePath);
    
    // Debug logging (can be removed in production)
    console.log(`[${new Date().toISOString()}] Request: ${req.url} -> ${filePath}`);
    
    // Normalize path to resolve any .. or . segments
    filePath = join(filePath); // This normalizes the path
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        // Try with .html extension if it doesn't already have one
        if (!filePath.endsWith('.html')) {
            const htmlPath = filePath + '.html';
            if (fs.existsSync(htmlPath)) {
                filePath = htmlPath;
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end(`File not found: ${urlPath}`);
                return;
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`File not found: ${urlPath}`);
            return;
        }
    }
    
    // Final security check: ensure resolved path is within public directory
    try {
        const resolvedPublicDir = fs.realpathSync(PUBLIC_DIR);
        const resolvedPath = fs.realpathSync(filePath);
        if (!resolvedPath.startsWith(resolvedPublicDir)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }
    } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
        return;
    }
    
    // Get file extension for content type
    const ext = filePath.split('.').pop().toLowerCase();
    const contentTypes = {
        'html': 'text/html',
        'js': 'application/javascript',
        'css': 'text/css',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon'
    };
    
    const contentType = contentTypes[ext] || 'text/plain';
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading file:', filePath, err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error reading file');
            return;
        }
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

