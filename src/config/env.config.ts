import * as dotenv from 'dotenv';
import { parseApiService } from '@hodfords/api-gateway';

dotenv.config();

export const env = {
    APP_PORT: Number(process.env.APP_PORT) || 3000, //API Gateway Port
    API_SERVICES: parseApiService(process.env.API_SERVICES), //Microservices which the gateway invokes and aggregates their results.
    REDIS: {
        HOST: process.env.REDIS_HOST, //Redis host
        PORT: Number(process.env.REDIS_PORT || '6379'), //Redis port
        DB: Number(process.env.REDIS_DB || '0') //Redis DB
    }
};
