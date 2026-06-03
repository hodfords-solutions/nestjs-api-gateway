import * as dotenv from 'dotenv';
import { ApiServiceDetail } from '@hodfords/api-gateway';

dotenv.config();

/**
 * Microservices which the gateway invokes and aggregates their results.
 * Declared as a structured object — `host` is derived from `docUrl`.
 * `directPrefixes` (optional) are forwarded to the service WITHOUT stripping the prefix.
 */
const apiServices: ApiServiceDetail[] = [
    {
        prefix: 'user-service',
        docUrl: 'http://127.0.0.1:1000/swagger-json',
        host: new URL('http://127.0.0.1:1000/swagger-json').origin,
        directPrefixes: ['oauth', 'oidc']
    }
];

export const env = {
    APP_PORT: Number(process.env.APP_PORT) || 3000, //API Gateway Port
    API_SERVICES: apiServices, //Microservices which the gateway invokes and aggregates their results.
    REDIS: {
        HOST: process.env.REDIS_HOST, //Redis host
        PORT: Number(process.env.REDIS_PORT || '6379'), //Redis port
        DB: Number(process.env.REDIS_DB || '0') //Redis DB
    }
};
