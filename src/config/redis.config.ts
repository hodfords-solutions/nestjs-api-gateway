import { RedisModule } from '@songkeys/nestjs-redis';
import { env } from '~config/env.config';

export const redisConfig = RedisModule.forRoot({
    config: {
        host: env.REDIS.HOST,
        port: env.REDIS.PORT,
        db: env.REDIS.DB
    }
});
