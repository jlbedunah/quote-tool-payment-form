import './load-env.js';

const PRODUCTION_ENDPOINT = 'https://api.authorize.net/xml/v1/request.api';
const SANDBOX_ENDPOINT = 'https://apitest.authorize.net/xml/v1/request.api';

const PRODUCTION_ALIASES = new Set(['production', 'prod', 'live', 'live-mode']);
const SANDBOX_ALIASES = new Set(['sandbox', 'test', 'testing', 'dev', 'development', 'stage', 'staging']);

const isRunningInVercel = Boolean(process.env.VERCEL);
const vercelEnvRaw = process.env.VERCEL_ENV || '';
const isVercelProdRuntime = isRunningInVercel && vercelEnvRaw === 'production';
const isVercelPreviewRuntime = isRunningInVercel && vercelEnvRaw === 'preview';
const isVercelDevRuntime = isRunningInVercel && vercelEnvRaw === 'development';

function normalizeEnvironment(value) {
    if (!value) {
        return null;
    }
    const normalized = String(value).trim().toLowerCase();
    if (PRODUCTION_ALIASES.has(normalized)) {
        return 'production';
    }
    if (SANDBOX_ALIASES.has(normalized)) {
        return 'sandbox';
    }
    return null;
}

export function resolveAuthorizeNetEnvironment() {
    const explicit = normalizeEnvironment(process.env.AUTHORIZE_NET_ENVIRONMENT);
    if (explicit) {
        return explicit;
    }

    const vercelEnv = normalizeEnvironment(process.env.VERCEL_ENV);
    if (vercelEnv === 'production') {
        return 'production';
    }

    if (isVercelPreviewRuntime) {
        const previewOverride = normalizeEnvironment(process.env.AUTHORIZE_NET_PREVIEW_ENVIRONMENT);
        if (previewOverride) {
            return previewOverride;
        }
        // Default previews to sandbox unless explicitly overridden
        return 'sandbox';
    }

    const nodeEnv = normalizeEnvironment(process.env.NODE_ENV);
    if (nodeEnv) {
        return nodeEnv;
    }

    return 'sandbox';
}

export function getAuthorizeNetEndpoint(environment = resolveAuthorizeNetEnvironment()) {
    return environment === 'production' ? PRODUCTION_ENDPOINT : SANDBOX_ENDPOINT;
}

export function getAuthorizeNetCredentials(environment = resolveAuthorizeNetEnvironment()) {
    if (environment === 'production') {
        return {
            loginId: firstDefined(
                process.env.AUTHORIZE_NET_LOGIN_ID_PROD,
                isVercelProdRuntime ? process.env.AUTHORIZE_NET_LOGIN_ID : undefined,
                !isRunningInVercel ? process.env.AUTHORIZE_NET_LOGIN_ID : undefined
            ),
            transactionKey: firstDefined(
                process.env.AUTHORIZE_NET_TRANSACTION_KEY_PROD,
                isVercelProdRuntime ? process.env.AUTHORIZE_NET_TRANSACTION_KEY : undefined,
                !isRunningInVercel ? process.env.AUTHORIZE_NET_TRANSACTION_KEY : undefined
            )
        };
    }

    return {
        loginId: firstDefined(
            process.env.AUTHORIZE_NET_LOGIN_ID_SANDBOX,
            !isVercelProdRuntime && !isVercelPreviewRuntime ? process.env.AUTHORIZE_NET_LOGIN_ID : undefined,
            !isRunningInVercel ? process.env.AUTHORIZE_NET_LOGIN_ID : undefined
        ),
        transactionKey: firstDefined(
            process.env.AUTHORIZE_NET_TRANSACTION_KEY_SANDBOX,
            !isVercelProdRuntime && !isVercelPreviewRuntime ? process.env.AUTHORIZE_NET_TRANSACTION_KEY : undefined,
            !isRunningInVercel ? process.env.AUTHORIZE_NET_TRANSACTION_KEY : undefined
        )
    };
}

export function getAuthorizeNetConfig(environment = resolveAuthorizeNetEnvironment()) {
    const { loginId, transactionKey } = getAuthorizeNetCredentials(environment);
    return {
        environment,
        endpoint: getAuthorizeNetEndpoint(environment),
        loginId,
        transactionKey
    };
}

export function buildAuthorizeNetConfigPriority() {
    const primaryEnvironment = resolveAuthorizeNetEnvironment();
    const fallbackEnvironment = primaryEnvironment === 'production' ? 'sandbox' : 'production';

    const primaryConfig = getAuthorizeNetConfig(primaryEnvironment);
    const fallbackConfig = getAuthorizeNetConfig(fallbackEnvironment);

    const configs = [];
    if (primaryConfig.loginId && primaryConfig.transactionKey) {
        configs.push(primaryConfig);
    }

    if ((fallbackConfig.loginId && fallbackConfig.transactionKey) ||
        (!primaryConfig.loginId || !primaryConfig.transactionKey)) {
        configs.push(fallbackConfig);
    }

    return configs;
}

function firstDefined(...candidates) {
    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
            return candidate;
        }
    }
    return null;
}

