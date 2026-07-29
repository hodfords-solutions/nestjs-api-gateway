import { DynamicModule, Module } from '@nestjs/common';
import { ThrottlerModule } from './throttlers/throttler.module';
import { RestfulModule } from './restful/restful.module';
import { McpModule } from './mcp/mcp.module';
import { ApiGatewayOption } from './types/api-gateway-option.type';
import { API_GATEWAY_OPTION } from './constants/api-gateway.constant';
import { REDIS_OPTION } from './redis/constants/redis.constant';
import Redis from 'ioredis';

@Module({})
export class ApiGatewayModule {
    static forRoot(option: ApiGatewayOption): DynamicModule {
        option.libraryPath = __dirname;

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
