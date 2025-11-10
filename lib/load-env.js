import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const ENV_LOADED_FLAG = '__CUSTOM_ENV_LOADED__';

if (!globalThis[ENV_LOADED_FLAG]) {
    const runningOnVercel = Boolean(process.env.VERCEL);

    if (!runningOnVercel) {
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
            }
        }
    }

    globalThis[ENV_LOADED_FLAG] = true;
}

