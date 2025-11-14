// This file loads environment variables from .env files for local development
// On Vercel, environment variables are provided automatically, so this is skipped

// Immediately check if we're on Vercel and skip everything if so
if (process.env.VERCEL) {
    // On Vercel, do nothing - environment variables are provided automatically
    // This prevents any module resolution issues
} else {
    // Only run in local development
    const ENV_LOADED_FLAG = '__CUSTOM_ENV_LOADED__';
    
    if (!globalThis[ENV_LOADED_FLAG]) {
        // Use an IIFE with async to handle dynamic imports
        (async () => {
            try {
                const { config: loadEnv } = await import('dotenv');
                const { existsSync } = await import('fs');
                const { dirname, resolve, join } = await import('path');
                const { fileURLToPath } = await import('url');

                if (typeof import.meta !== 'undefined' && import.meta.url) {
                    const currentFilePath = fileURLToPath(import.meta.url);
                    const rootDir = resolve(dirname(currentFilePath), '..');

                    const candidateFiles = [
                        '.env.local',
                        '.env.development.local',
                        '.env.development',
                        '.env'
                    ];

                    for (const fileName of candidateFiles) {
                        const filePath = join(rootDir, fileName);
                        if (existsSync(filePath)) {
                            loadEnv({ path: filePath });
                            break;
                        }
                    }
                }
            } catch (error) {
                // Silently fail - this is expected in some environments
                if (process.env.NODE_ENV === 'development') {
                    console.warn('Could not load .env files:', error.message);
                }
            }
        })();
        
        globalThis[ENV_LOADED_FLAG] = true;
    }
}

