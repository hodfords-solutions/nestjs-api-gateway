import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { env } from './env.config.js';

const protocol = env.REDIS.TLS ? 'rediss' : 'redis';

export const redisConfig = CacheModule.register({
    store: new KeyvRedis({
        url: `${protocol}://${env.REDIS.HOST}:${env.REDIS.PORT}/${env.REDIS.DB}`,
        username: env.REDIS.USERNAME,
        password: env.REDIS.PASSWORD,
        ...(env.REDIS.TLS ? { socket: { tls: true, ...env.REDIS.TLS } } : {})
    })
});
