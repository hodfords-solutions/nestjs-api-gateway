import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { env } from '~config/env.config';

export const redisConfig = CacheModule.register({
    store: new KeyvRedis(`redis://${env.REDIS.HOST}:${env.REDIS.PORT}?db=${env.REDIS.DB}`)
});
