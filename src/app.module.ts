import { Module } from '@nestjs/common';
import { AppController } from '~app.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiGatewayModule } from '@hodfords/api-gateway';
import { redisConfig } from '~config/redis.config';
import { AuthenticationMiddleware } from '~middleware/authentication.middleware';
import { StaticRequestMiddleware } from '~middleware/static-request.middleware';
import { WsAuthenticationMiddleware } from '~middleware/ws-authentication.middleware';
import { env } from '~config/env.config';

@Module({
    imports: [
        redisConfig,
        ScheduleModule.forRoot(),
        ApiGatewayModule.forRoot({
            apiServices: env.API_SERVICES,
            openApiSecurityKeys: ['auth-user-id'],
            excludeHeaders: ['auth-user-id'],
            throttler: {
                globalRateLimit: 60,
                isEnable: true,
                globalRateLimitTTL: 60
            },
            restful: { isEnableDocument: true },
            redis: {
                host: env.REDIS.HOST,
                port: env.REDIS.PORT,
                db: env.REDIS.DB
            }
        })
    ],
    controllers: [AppController],
    providers: [AuthenticationMiddleware, StaticRequestMiddleware, WsAuthenticationMiddleware]
})
export class AppModule {}
