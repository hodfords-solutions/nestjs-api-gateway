<p align="center">
  <a href="http://opensource.hodfords.uk" target="blank"><img src="https://opensource.hodfords.uk/img/logo.svg" width="320" alt="Nest Logo" /></a>
</p>

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
            openApiSecurityApiKeys: ['x-api-key'],
            excludeHeaders: ['auth-user-id'],
            scalarOptions: {
                showExtensions: false,
            },
            throttler: {
                globalIpRateLimit: 120,
                globalIpRateLimitTTL: 60,
                globalCustomRateLimit: 60,
                globalCustomRateLimitTTL: 60,
                isEnable: true
            }
        })
    ],
    controllers: [],
    providers: []
})
export class AppModule {}
```

#### Redis connection
The `redis` option is passed to `ioredis`. Besides `host`, `port` and `db`, it accepts credentials and TLS settings:
```typescript
ApiGatewayModule.forRoot({
    // ...
    redis: {
        host: env.REDIS.HOST,
        port: env.REDIS.PORT,
        db: env.REDIS.DB,
        username: env.REDIS.USERNAME, // optional, Redis ACL user
        password: env.REDIS.PASSWORD, // optional
        tls: true // or Node's tls.connect options: { ca, cert, key, servername, rejectUnauthorized }
    }
})
```
Set `tls: true` for a managed Redis with a publicly trusted certificate (`rediss://`). Pass an object when you need a
custom CA, client certificates, or an explicit SNI name. `rejectUnauthorized: false` disables certificate verification
and should only be used with self-signed certificates outside production.

In this repository the values are read from the environment (see `.env.example`): `REDIS_USERNAME`, `REDIS_PASSWORD`,
`REDIS_TLS`, `REDIS_TLS_CA_FILE`, `REDIS_TLS_CERT_FILE`, `REDIS_TLS_KEY_FILE`, `REDIS_TLS_SERVERNAME` and
`REDIS_TLS_REJECT_UNAUTHORIZED`.

#### Custom Authentication Header
You can handle the authentication header by creating a custom authentication handler. The `handle` method will be called before the request is processed. The `handle` method accepts the incoming request object and should return a boolean value indicating whether the request is authenticated.
```typescript
@ProxyMiddleware()
export class AuthenticationMiddleware implements ProxyMiddlewareHandler {
    async handle(routerDetail: RouterDetail, request: IncomingMessage, proxyRequest: ProxyRequest): Promise<boolean> {
        proxyRequest.addHeaders({ 'auth-user-id': '123' });
        return true;
    }
}
```
Similarly, you can create a WebSocket authentication handler by decorating the `@WsProxyMiddleware`. The `handle` method will be called before the request is processed. The `handle` method accepts the incoming request object and should return a boolean value indicating whether the request is authenticated.
```typescript
@WsProxyMiddleware()
export class WsAuthenticationMiddleware implements WsProxyMiddlewareHandler {
    async handle(request: IncomingMessage, proxyRequest: ProxyRequest): Promise<boolean> {
        proxyRequest.addHeaders({ 'auth-user-id': '123' });
        return true;
    }
}
```

#### Static File
You can create a static file handler by decorating the `@StaticRequestHandler`. The `isStaticRequest` method will be called before the request is processed. The `isStaticRequest` method accepts the incoming request object and should return a boolean value indicating whether the request is for a static file.

```typescript

@ProxyValidation()
export class StaticRequestMiddleware implements ProxyValidationHandler {
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

#### Global rate limits
The throttler enforces two independent global limits on every request:

- **`globalIpRateLimit` / `globalIpRateLimitTTL`** — always bucketed by `request.ip`. This is a DDoS / abuse baseline that does **not** go through `keyResolver` and is **not** skipped when the resolver returns an empty value.
- **`globalCustomRateLimit` / `globalCustomRateLimitTTL`** — bucketed by whatever `keyResolver` returns (or `request.ip` if no resolver is configured). Skipped entirely when the resolver returns an empty value.

A request is rejected as soon as either limit is exceeded.

#### Custom rate-limit key
By default the custom limit buckets requests by `request.ip`. To bucket by something else (authenticated user id, tenant id, API key, etc.), supply a `keyResolver` callback in the throttler options. The callback receives `{ request, routerDetail }` and returns the string to use as the bucket identity.

```typescript
ApiGatewayModule.forRoot({
    // ... other options ...
    throttler: {
        globalIpRateLimit: 120,
        globalIpRateLimitTTL: 60,
        globalCustomRateLimit: 60,
        globalCustomRateLimitTTL: 60,
        isEnable: true,
        keyResolver: ({ request }) => {
            const userId = request.headers['auth-user-id'];
            return typeof userId === 'string' && userId.length > 0
                ? `user:${userId}`
                : `ip:${request.ip}`;
        }
    }
})
```

**Skip the custom limit for selected requests** by returning an empty value (`null`, `undefined`, `''`, or a whitespace-only string). The throttler then bypasses both the custom global limit and any per-endpoint `@ApiRateLimit` rules without incrementing their counters. The IP-based global limit still applies.

```typescript
keyResolver: ({ request, routerDetail }) => {
    if (request.url === '/healthz') return null;                                  // skip health checks
    if (routerDetail.operationId === 'InternalProbeController_ping') return null; // skip by operation id
    const userId = request.headers['auth-user-id'];
    return typeof userId === 'string' && userId.length > 0 ? `user:${userId}` : `ip:${request.ip}`;
}
```

The same identity is used for the custom global limit and for any per-endpoint `@ApiRateLimit` rule. Resolvers may be asynchronous. If the resolver throws, the error propagates through the gateway's existing exception pipeline (no silent allow, no silent deny). If `keyResolver` is omitted, the custom limit falls back to `request.ip` (matching the IP limit's bucketing key). See `specs/002-throttler-key-callback/quickstart.md` for the full walkthrough.

## Support:

If you encounter any issues, have questions, or need assistance with the API Gateway, please contact the development team

Thank you for using the API Gateway! Happy API management and development!
