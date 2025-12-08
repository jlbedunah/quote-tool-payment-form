import { supabase } from './supabase.js';
import { Resend } from 'resend';

// Initialize Resend for error emails
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ERROR_EMAIL_RECIPIENT = 'jason@mybookkeepers.com';

// Rate limiting for error emails (prevent spam)
const errorEmailRateLimit = new Map(); // Map of error signature -> last sent timestamp
const ERROR_EMAIL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Determine environment
function getEnvironment() {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV; // 'production', 'preview', or 'development'
  }
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

// Get deployment URL if available
function getDeploymentUrl() {
  return process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : process.env.DEPLOYMENT_URL || null;
}

// Extract function name from error stack trace
function getFunctionName(error) {
  if (!error || !error.stack) {
    return null;
  }
  
  try {
    const stackLines = error.stack.split('\n');
    // Look for function name in stack trace (usually second line)
    if (stackLines.length > 1) {
      const match = stackLines[1].match(/at\s+(\w+)/);
      if (match) {
        return match[1];
      }
    }
  } catch (e) {
    // Ignore errors in parsing
  }
  
  return null;
}

// Normalize error object to JSONB-compatible structure
function normalizeError(error) {
  if (!error) {
    return null;
  }
  
  const normalized = {
    name: error.name || 'Error',
    message: error.message || String(error),
  };
  
  if (error.stack) {
    normalized.stack = error.stack;
  }
  
  // Include additional error properties if they exist
  if (error.status !== undefined) {
    normalized.status = error.status;
  }
  if (error.statusText) {
    normalized.statusText = error.statusText;
  }
  if (error.url) {
    normalized.url = error.url;
  }
  if (error.responseBody) {
    normalized.responseBody = error.responseBody;
  }
  if (error.code) {
    normalized.code = error.code;
  }
  
  return normalized;
}

// Create error signature for rate limiting
function createErrorSignature(source, message, error) {
  // Create a signature based on source and first part of message
  const messagePrefix = message.substring(0, 100);
  const errorMessage = error?.message?.substring(0, 100) || '';
  return `${source}:${messagePrefix}:${errorMessage}`;
}

// Send error email notification
async function sendErrorEmail(logEntry) {
  // Only send for error level
  if (logEntry.level !== 'error') {
    return;
  }
  
  // Check rate limiting
  const signature = createErrorSignature(
    logEntry.source, 
    logEntry.message, 
    logEntry.error_details ? { message: logEntry.error_details.message } : null
  );
  
  const lastSent = errorEmailRateLimit.get(signature);
  const now = Date.now();
  
  if (lastSent && (now - lastSent) < ERROR_EMAIL_COOLDOWN_MS) {
    console.log('Error email rate limited:', signature);
    return; // Skip sending if within cooldown period
  }
  
  // Update rate limit
  errorEmailRateLimit.set(signature, now);
  
  // Clean up old entries from rate limit map (prevent memory leak)
  if (errorEmailRateLimit.size > 1000) {
    const cutoff = now - ERROR_EMAIL_COOLDOWN_MS * 2;
    for (const [key, timestamp] of errorEmailRateLimit.entries()) {
      if (timestamp < cutoff) {
        errorEmailRateLimit.delete(key);
      }
    }
  }
  
  // Don't send if Resend is not configured
  if (!resend) {
    console.warn('Resend not configured. Skipping error email.');
    return;
  }
  
  try {
    // Build email content
    const errorDetails = logEntry.error_details || {};
    const metadata = logEntry.metadata || {};
    
    const emailSubject = `[ERROR] ${logEntry.source} - ${logEntry.message.substring(0, 50)}${logEntry.message.length > 50 ? '...' : ''}`;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc2626; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .section { margin-bottom: 20px; }
          .section-title { font-weight: bold; color: #1f2937; margin-bottom: 10px; font-size: 16px; }
          .field { margin-bottom: 10px; }
          .field-label { font-weight: bold; color: #4b5563; }
          .field-value { color: #6b7280; margin-top: 5px; }
          .code-block { background-color: #1f2937; color: #f3f4f6; padding: 15px; border-radius: 5px; overflow-x: auto; font-family: monospace; font-size: 12px; white-space: pre-wrap; }
          .metadata { background-color: white; padding: 15px; border-radius: 5px; border: 1px solid #e5e7eb; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
          a { color: #2563eb; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🚨 Application Error Alert</h2>
          </div>
          <div class="content">
            <div class="section">
              <div class="section-title">Error Details</div>
              <div class="field">
                <div class="field-label">Timestamp:</div>
                <div class="field-value">${new Date(logEntry.created_at).toLocaleString()}</div>
              </div>
              <div class="field">
                <div class="field-label">Source:</div>
                <div class="field-value">${logEntry.source}</div>
              </div>
              ${logEntry.function_name ? `
              <div class="field">
                <div class="field-label">Function:</div>
                <div class="field-value">${logEntry.function_name}</div>
              </div>
              ` : ''}
              <div class="field">
                <div class="field-label">Message:</div>
                <div class="field-value">${logEntry.message}</div>
              </div>
              ${errorDetails.message ? `
              <div class="field">
                <div class="field-label">Error Message:</div>
                <div class="field-value">${errorDetails.message}</div>
              </div>
              ` : ''}
              ${errorDetails.name ? `
              <div class="field">
                <div class="field-label">Error Type:</div>
                <div class="field-value">${errorDetails.name}</div>
              </div>
              ` : ''}
              ${errorDetails.status ? `
              <div class="field">
                <div class="field-label">HTTP Status:</div>
                <div class="field-value">${errorDetails.status} ${errorDetails.statusText || ''}</div>
              </div>
              ` : ''}
              ${errorDetails.url ? `
              <div class="field">
                <div class="field-label">URL:</div>
                <div class="field-value">${errorDetails.url}</div>
              </div>
              ` : ''}
            </div>
            
            ${errorDetails.stack ? `
            <div class="section">
              <div class="section-title">Stack Trace</div>
              <div class="code-block">${errorDetails.stack}</div>
            </div>
            ` : ''}
            
            ${Object.keys(metadata).length > 0 ? `
            <div class="section">
              <div class="section-title">Context Metadata</div>
              <div class="metadata">
                <div class="code-block">${JSON.stringify(metadata, null, 2)}</div>
              </div>
            </div>
            ` : ''}
            
            ${errorDetails.responseBody ? `
            <div class="section">
              <div class="section-title">Response Body</div>
              <div class="code-block">${errorDetails.responseBody}</div>
            </div>
            ` : ''}
            
            <div class="section">
              <div class="section-title">Environment</div>
              <div class="field">
                <div class="field-label">Environment:</div>
                <div class="field-value">${logEntry.environment}</div>
              </div>
              ${logEntry.deployment_url ? `
              <div class="field">
                <div class="field-label">Deployment:</div>
                <div class="field-value"><a href="${logEntry.deployment_url}">${logEntry.deployment_url}</a></div>
              </div>
              ` : ''}
            </div>
            
            <div class="footer">
              <p>This is an automated error notification from the application logging system.</p>
              <p>View all logs in the admin dashboard.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const emailText = `
Application Error Alert

Timestamp: ${new Date(logEntry.created_at).toLocaleString()}
Source: ${logEntry.source}
${logEntry.function_name ? `Function: ${logEntry.function_name}\n` : ''}
Message: ${logEntry.message}
${errorDetails.message ? `Error: ${errorDetails.message}\n` : ''}
${errorDetails.name ? `Error Type: ${errorDetails.name}\n` : ''}
${errorDetails.status ? `HTTP Status: ${errorDetails.status} ${errorDetails.statusText || ''}\n` : ''}
${errorDetails.url ? `URL: ${errorDetails.url}\n` : ''}

${errorDetails.stack ? `Stack Trace:\n${errorDetails.stack}\n` : ''}

${Object.keys(metadata).length > 0 ? `Context:\n${JSON.stringify(metadata, null, 2)}\n` : ''}

Environment: ${logEntry.environment}
${logEntry.deployment_url ? `Deployment: ${logEntry.deployment_url}\n` : ''}
    `;
    
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'errors@mybookkeepers.com',
      to: [ERROR_EMAIL_RECIPIENT],
      subject: emailSubject,
      html: emailHtml,
      text: emailText
    });
    
    console.log('Error email sent successfully:', signature);
  } catch (emailError) {
    // Don't fail logging if email fails
    console.error('Failed to send error email:', emailError);
  }
}

// Main logging function
export async function log(level, source, message, metadata = {}, errorDetails = null) {
  const logEntry = {
    level: level.toLowerCase(),
    source,
    function_name: errorDetails ? getFunctionName(errorDetails) : null,
    message: String(message),
    metadata: metadata || {},
    error_details: errorDetails ? normalizeError(errorDetails) : null,
    environment: getEnvironment(),
    deployment_url: getDeploymentUrl(),
    created_at: new Date().toISOString()
  };
  
  // Always log to console (for development/debugging)
  const consoleMethod = level === 'error' ? console.error :
                       level === 'warn' ? console.warn :
                       level === 'debug' ? console.debug :
                       console.log;
  
  consoleMethod(`[${level.toUpperCase()}] ${source}:`, message, metadata, errorDetails || '');
  
  // Write to Supabase (non-blocking, don't fail if this errors)
  if (supabase) {
    try {
      const { error } = await supabase
        .from('application_logs')
        .insert([logEntry]);
      
      if (error) {
        console.error('Failed to write log to Supabase:', error);
        // Still log to console even if Supabase fails
      }
    } catch (dbError) {
      console.error('Exception writing log to Supabase:', dbError);
      // Don't throw - logging should never break the app
    }
  } else {
    // Supabase not configured, just log to console
    if (process.env.NODE_ENV === 'development') {
      console.warn('Supabase not configured. Logs will only be written to console.');
    }
  }
  
  // Send error email for error-level logs
  if (level === 'error') {
    try {
      await sendErrorEmail(logEntry);
    } catch (emailError) {
      // Don't fail if email fails
      console.error('Failed to send error email:', emailError);
    }
  }
}

// Convenience functions
export async function logDebug(source, message, metadata = {}) {
  return log('debug', source, message, metadata);
}

export async function logInfo(source, message, metadata = {}) {
  return log('info', source, message, metadata);
}

export async function logWarn(source, message, metadata = {}) {
  return log('warn', source, message, metadata);
}

export async function logError(source, message, metadata = {}, error = null) {
  return log('error', source, message, metadata, error);
}

