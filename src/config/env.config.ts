import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { ConnectionOptions } from 'tls';
import { ApiServiceDetail } from '../../libs/api-gateway/index.js';

dotenv.config();

/**
 * Builds the TLS options for Redis from the environment.
 * Returns `undefined` when `REDIS_TLS` is not enabled, so the connection stays plain TCP.
 */
function buildRedisTls(): ConnectionOptions | undefined {
    if (process.env.REDIS_TLS !== 'true') {
        return undefined;
    }

    return {
        ...(process.env.REDIS_TLS_CA_FILE ? { ca: readFileSync(process.env.REDIS_TLS_CA_FILE) } : {}),
        ...(process.env.REDIS_TLS_CERT_FILE ? { cert: readFileSync(process.env.REDIS_TLS_CERT_FILE) } : {}),
        ...(process.env.REDIS_TLS_KEY_FILE ? { key: readFileSync(process.env.REDIS_TLS_KEY_FILE) } : {}),
        ...(process.env.REDIS_TLS_SERVERNAME ? { servername: process.env.REDIS_TLS_SERVERNAME } : {}),
        ...(process.env.REDIS_TLS_REJECT_UNAUTHORIZED === 'false' ? { rejectUnauthorized: false } : {})
    };
}

/**
 * Microservices which the gateway invokes and aggregates their results.
 * Declared as a structured object — `host` is derived from `docUrl`.
 * `directPrefixes` (optional) are forwarded to the service WITHOUT stripping the prefix.
 */
const apiServices: ApiServiceDetail[] = [
    {
        prefix: 'user-service',
        docUrl: 'http://localhost:4020/documents-json',
        host: new URL('http://localhost:4020/documents-json').origin,
        directPrefixes: ['oauth', 'oidc']
    }
];

export const env = {
    APP_PORT: Number(process.env.APP_PORT) || 3000, //API Gateway Port
    API_SERVICES: apiServices, //Microservices which the gateway invokes and aggregates their results.
    REDIS: {
        HOST: process.env.REDIS_HOST || 'localhost', //Redis host
        PORT: Number(process.env.REDIS_PORT || '6379'), //Redis port
        DB: Number(process.env.REDIS_DB || '0'), //Redis DB
        USERNAME: process.env.REDIS_USERNAME, //Redis username (ACL)
        PASSWORD: process.env.REDIS_PASSWORD, //Redis password
        TLS: buildRedisTls() //Redis TLS options, undefined when REDIS_TLS is not "true"
    }
};
