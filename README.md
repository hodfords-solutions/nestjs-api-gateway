# API Gateway

The API Gateway houses the source code and documentation for the API Gateway - a powerful and versatile solution for managing and deploying APIs within a distributed and microservices-oriented architecture. This repository serves as the central hub for collaboration, version control, and issue tracking related to the development and enhancement of the API Gateway.

## Key Features:

- **Centralized API Management**: The API Gateway streamlines API management by providing a central entry point for client applications. It handles API requests, directs traffic to appropriate microservices, and offers additional functionalities to developers and administrators.

- **Security and Authentication**: Security is paramount, and the API Gateway offers robust authentication and authorization mechanisms to protect APIs from unauthorized access. It supports various authentication protocols, including API keys, JWT.

- **Rate Limiting and Throttling**: To prevent abuse and ensure fair usage, the API Gateway allows administrators to set rate limits and throttling rules. This helps maintain API performance and prevents any single client from overwhelming the system.

- **Logging and Monitoring**: The API Gateway provides comprehensive logging and monitoring capabilities, allowing developers and administrators to gain insights into API usage, performance, and errors in real-time.

- **WebSocket Support**: Beyond traditional RESTful APIs, the API Gateway supports WebSocket communication for real-time interactions and push notifications.

- **Error Handling and Fault Tolerance**: The API Gateway is designed with robust error handling and fault tolerance mechanisms to ensure high availability and reliability.

## Usage

#### Install
```shell
npm install @hodfords/api-gateway
```

#### Configuration
Import the `ApiGatewayModule` and use the `forRoot` method to configure the API Gateway. The `forRoot` method accepts an options object with the following properties:
```typescript
@Module({
    imports: [
        RedisModule.forRoot({
            config: {
                host: env.REDIS.HOST,
                port: env.REDIS.PORT,
                db: env.REDIS.DB
            }
        }), // Required
        ScheduleModule.forRoot(), // Required
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
    controllers: [],
    providers: []
})
export class AppModule {}
```

#### Custom Authentication Header
You can create a custom header handler by decorator the `@HeaderHandler`. The `handle` method will be called before the request is processed. The `handle` method accepts two parameters: `routerDetail` and `request`. The `routerDetail` parameter contains information about the route, while the `request` parameter is the incoming request object. The `handle` method should return a dictionary of headers to be added to the request.
```typescript
@HeaderHandler()
export class AuthHeaderHandler implements HeaderHandlerInterface {
    async handle(routerDetail: RouterDetail, request: IncomingMessage): Promise<NodeJS.Dict<string>> {
        return { authUserId: '123' };
    }
}
```
Similarly, you can create a WebSocket header handler by decorating the `@WsHeaderHandler`. The `handle` method will be called before the WebSocket connection is established. The `handle` method accepts the incoming request object and should return a dictionary of headers to be added to the request.
```typescript
@WsHeaderHandler()
export class WsAuthHeaderHandler implements WsHeaderHandlerInterface {
    async handle(request: IncomingMessage): Promise<NodeJS.Dict<string>> {
        return { authUserId: '123' };
    }
}
```

#### Static File
You can create a static file handler by decorating the `@StaticRequestHandler`. The `isStaticRequest` method will be called before the request is processed. The `isStaticRequest` method accepts the incoming request object and should return a boolean value indicating whether the request is for a static file.
```typescript
@ProxyValidation()
export class StaticRequestHandler implements ProxyValidationInterface {
    isStaticRequest(request: IncomingMessage): boolean {
        return request.url.includes('/images/') || request.url.includes('/statics/');
    }
}
```

#### Document
API Gateway will aggregate all subservices into one. You can access by the link `http://gateway/documents`

#### Authenticate
API Gateway will process the jwt tokens and remove the token from the header. It will then add a new header key to the request called `auth-user-id`
> To define a request that requires authentication, simply use the decorator `Auth()`. This decorator includes a check header function and a function that adds information to OpenAPI.
> 
> In subservices, getting user information is eliminated. Instead you can just get the userId with decorator `@CurrentUserId() id: string` instead of decorator `@CurrentUser()`

```typescript
@Auth()
index(@CurrentUserId() id: string): string {
    return 'Hello word'
}
```

#### Rate limit
>`ApiRateLimit(limit: number, ttl: number, status?: number)`

> **Parameter:**
> - limit: number of requests
> - ttl: limited time request
> - status: *[optional]* limit requests by status, for example you want to limit the number of failed login attempts in 1 minute to 3 times: `@ApiRateLimit(3, 60, 401)`

```typescript
@ApiRateLimit(5, 60, 200)
@ApiRateLimit(30, 60 * 60, 200)
@ApiRateLimit(3, 60, 401)
index(): string {
    return 'Hello word'
}
```

## Support:

If you encounter any issues, have questions, or need assistance with the API Gateway, please contact the development team

Thank you for using the API Gateway! Happy API management and development!
