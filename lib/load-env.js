// This file loads environment variables from .env files for local development
// On Vercel, environment variables are provided automatically, so this is skipped

const ENV_LOADED_FLAG = '__CUSTOM_ENV_LOADED__';

// On Vercel, skip loading .env files entirely to avoid module resolution issues
// Vercel provides environment variables automatically via process.env
if (!globalThis[ENV_LOADED_FLAG] && !process.env.VERCEL) {
    // Use an IIFE with async to handle dynamic imports
    (async () => {
        try {
            // Only load in local development (not on Vercel)
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
}

globalThis[ENV_LOADED_FLAG] = true;

