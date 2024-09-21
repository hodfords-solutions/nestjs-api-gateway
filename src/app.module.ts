import { Module } from '@nestjs/common';
import { AppController } from '~app.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiGatewayModule } from '@hodfords/api-gateway';
import { redisConfig } from '~config/redis.config';
import { AuthHeaderHandler } from '~handlers/auth-header.handler';
import { StaticRequestHandler } from '~handlers/static-request.handler';
import { WsAuthHeaderHandler } from '~handlers/ws-auth-header.handler';
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
            }
        })
    ],
    controllers: [AppController],
    providers: [AuthHeaderHandler, StaticRequestHandler, WsAuthHeaderHandler]
})
export class AppModule {}
