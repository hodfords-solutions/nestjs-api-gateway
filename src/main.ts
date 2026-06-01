import { NestFactory } from '@nestjs/core';
import { AppModule } from '~app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { env } from '~config/env.config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Initialize and configures a NestJS application,
 * set up view directories, static assets, CORS (Cross-Origin Resource Sharing) settings, and start the application server
 */
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: false
    });
    app.setBaseViewsDir(join(__dirname, 'views'));
    app.useStaticAssets(join(__dirname, 'statics'), { prefix: '/statics' });
    app.setViewEngine('hbs');

    app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

    const swaggerConfig = new DocumentBuilder()
        .setTitle('API Gateway')
        .setDescription('Sample API Gateway endpoints')
        .setVersion('1.0')
        .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
        .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('swagger', app, swaggerDocument);

    await app.listen(env.APP_PORT);
}

bootstrap()
    .then(() => console.log(`Server is running on ${env.APP_PORT}`))
    .catch(console.error);
