import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiGatewayModule } from '../libs/api-gateway/index.js';
import { redisConfig } from './config/redis.config.js';
import { AuthenticationMiddleware } from './middleware/authentication.middleware.js';
import { StaticRequestMiddleware } from './middleware/static-request.middleware.js';
import { WsAuthenticationMiddleware } from './middleware/ws-authentication.middleware.js';
import { McpAuthenticationMiddlewareImpl } from './middleware/mcp-authentication.middleware.js';
import { env } from './config/env.config.js';

@Module({
    imports: [
        redisConfig,
        ScheduleModule.forRoot(),
        ApiGatewayModule.forRoot({
            apiServices: env.API_SERVICES,
            openApiSecurityKeys: ['auth-user-id'],
            openApiSecurityApiKeys: ['x-api-key'],
            excludeHeaders: ['auth-user-id', 'permission-in-any-guard'],
            throttler: {
                globalIpRateLimit: 60,
                globalIpRateLimitTTL: 60,
                globalCustomRateLimit: 60,
                globalCustomRateLimitTTL: 60,
                isEnable: true,
                keyResolver: ({ request }) => {
                    if (request.url === '/health') {
                        return null;
                    }
                    const userId = (request as any).authUserId;
                    console.log(userId);
                    return typeof userId === 'string' && userId.length > 0 ? `user:${userId}` : `ip:${request.ip}`;
                }
            },
            scalarOptions: {
                showExtensions: true
            },
            restful: { isEnableDocument: true, hideDocumentIds: ['AppController_getHello', 'AppController_getHealth'] },
            redis: {
                host: env.REDIS.HOST,
                port: env.REDIS.PORT,
                db: env.REDIS.DB,
                username: env.REDIS.USERNAME,
                password: env.REDIS.PASSWORD,
                tls: env.REDIS.TLS
            },
            pool: {
                connections: 100,
                pipelining: 1
            },
            mcp: {
                enabled: true
            }
        })
    ],
    controllers: [AppController],
    providers: [
        AuthenticationMiddleware,
        StaticRequestMiddleware,
        WsAuthenticationMiddleware,
        McpAuthenticationMiddlewareImpl
    ]
})
export class AppModule {}
