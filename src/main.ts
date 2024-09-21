import { NestFactory } from '@nestjs/core';
import { AppModule } from '~app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { env } from '~config/env.config';

/**
 * Initialize and configures a NestJS application,
 * set up view directories, static assets, CORS (Cross-Origin Resource Sharing) settings, and start the application server
 */
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.setBaseViewsDir(join(__dirname, 'views'));
    app.useStaticAssets(join(__dirname, 'statics'), { prefix: '/statics' });
    app.setViewEngine('hbs');

    app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

    await app.listen(env.APP_PORT);
}

bootstrap()
    .then(() => console.log(`Server is running on ${env.APP_PORT}`))
    .catch(console.error);
