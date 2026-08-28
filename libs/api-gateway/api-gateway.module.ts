import { DynamicModule, Module } from '@nestjs/common';
import { ThrottlerModule } from './throttlers/throttler.module.js';
import { RestfulModule } from './restful/restful.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { ApiGatewayOption } from './types/api-gateway-option.type.js';
import { API_GATEWAY_OPTION } from './constants/api-gateway.constant.js';
import { REDIS_OPTION } from './redis/constants/redis.constant.js';
import { Redis } from 'ioredis';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));

@Module({})
export class ApiGatewayModule {
    static forRoot(option: ApiGatewayOption): DynamicModule {
        option.libraryPath = currentDir;

        const redisProvider = {
            provide: REDIS_OPTION,
            useFactory: () => {
                return new Redis({
                    host: option.redis?.host,
                    port: option.redis?.port,
                    db: option.redis?.db,
                    username: option.redis?.username,
                    password: option.redis?.password,
                    ...(option.redis?.tls ? { tls: option.redis.tls === true ? {} : option.redis.tls } : {})
                });
            }
        };

        return {
            global: true,
            module: ApiGatewayModule,
            imports: [
                ThrottlerModule.forRoot(option.throttler),
                ...(option.mcp?.enabled ? [McpModule.forRoot(option.mcp)] : []),
                RestfulModule.forRoot(option.restful)
            ],
            controllers: [],
            providers: [
                {
                    provide: API_GATEWAY_OPTION,
                    useValue: option
                },
                redisProvider
            ],
            exports: [
                {
                    provide: API_GATEWAY_OPTION,
                    useValue: option
                },
                redisProvider,
                RestfulModule
            ]
        };
    }
}
