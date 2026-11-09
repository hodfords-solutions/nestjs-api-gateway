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

#### Requirements
This package is **ESM-only** and targets **NestJS 12**. It requires Node.js `>=20.19.0`
(`>=22.12`, `>=24.15` or `>=26` on newer major lines) and must be loaded with `import`,
not `require()`.

| Package version | NestJS |
|---|---|
| `12.x` | NestJS 12 |
| `11.x` | NestJS 11 |

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
The throttler enforces two independent global limits:

- **`globalIpRateLimit` / `globalIpRateLimitTTL`** — bucketed by the client IP (see [IP normalisation](#ip-normalisation)). This is a DDoS / abuse baseline that does **not** use the `keyResolver` key and is **not** skipped when the resolver returns an empty value. Which requests it applies to is controlled by `globalIpRateLimitScope`.
- **`globalCustomRateLimit` / `globalCustomRateLimitTTL`** — bucketed by whatever `keyResolver` returns (or the client IP if no resolver is configured). Skipped entirely when the resolver returns an empty value.

A request is rejected as soon as either limit is exceeded.

#### Global IP limit scope
`globalIpRateLimitScope` (default `'all'`) decides which requests count against the global IP bucket:

| Scope | Behaviour |
| --- | --- |
| `'all'` (default) | Every request counts, checked **before** the proxy middlewares (authentication) run. Unchanged from previous versions. |
| `'anonymous'` | Identity is resolved first; only requests that are **not authenticated** count. Requests rejected by a proxy middleware (returning `false` or throwing, e.g. a bad token) also count, since their identity was never established. |

Use `'anonymous'` when many users share one public IP (corporate NAT, VPN egress, mobile carrier CGNAT): with `'all'` they all drain one IP bucket, so one busy office can lock everyone out. With `'anonymous'`, authenticated traffic is bounded by the per-identity custom limit instead, and the IP bucket stays a flood ceiling for unauthenticated traffic.

A request is authenticated only when `keyResolver` says so by returning an object `{ key, authenticated: true }`. A plain string result (and having no resolver at all) is treated as anonymous, so turning the scope on without updating the resolver keeps the old behaviour.

```typescript
throttler: {
    globalIpRateLimit: 1000,
    globalIpRateLimitTTL: 60,
    globalCustomRateLimit: 240,
    globalCustomRateLimitTTL: 60,
    isEnable: true,
    globalIpRateLimitScope: 'anonymous',
    keyResolver: ({ request, ip }) => {
        const userId = (request as any).authUserId; // set by your authentication ProxyMiddleware
        return userId ? { key: `user:${userId}`, authenticated: true } : `ip:${ip}`;
    }
}
```

> Only mark a request `authenticated` from state your own authentication middleware verified (never from a raw client header), otherwise a client can opt itself out of the IP limit.

#### IP normalisation
Every IP-based key (the global IP bucket, and the IP fallback identity used by the custom and per-endpoint limits) uses a normalised client address:

- IPv4-mapped IPv6 addresses (`::ffff:203.0.113.7`) are reduced to the IPv4 address (`203.0.113.7`).
- IPv6 addresses are masked to their `/64` prefix (`2001:db8:1:2::abcd` → `2001:db8:1:2:0:0:0:0/64`). A /64 is the smallest block normally assigned to one subscriber, so a client cannot dodge a per-IP limit by rotating through its own addresses. Set `ipv6Subnet` (1–128) to change the prefix length; `128` keeps one bucket per address.

The client address is taken from `request.ip`, so configure Express `trust proxy` when the gateway runs behind a load balancer. The normalised address is passed to `keyResolver` as `ip`; prefer it over `request.ip` when building IP-based keys.

#### Custom rate-limit key
By default the custom limit buckets requests by `request.ip`. To bucket by something else (authenticated user id, tenant id, API key, etc.), supply a `keyResolver` callback in the throttler options. The callback receives `{ request, routerDetail, ip }` (`ip` is the [normalised](#ip-normalisation) client address) and returns the string to use as the bucket identity, or `{ key, authenticated }` (see [Global IP limit scope](#global-ip-limit-scope)).

```typescript
ApiGatewayModule.forRoot({
    // ... other options ...
    throttler: {
        globalIpRateLimit: 120,
        globalIpRateLimitTTL: 60,
        globalCustomRateLimit: 60,
        globalCustomRateLimitTTL: 60,
        isEnable: true,
        keyResolver: ({ request, ip }) => {
            const userId = request.headers['auth-user-id'];
            return typeof userId === 'string' && userId.length > 0
                ? `user:${userId}`
                : `ip:${ip}`;
        }
    }
})
```

**Skip the custom limit for selected requests** by returning an empty value (`null`, `undefined`, `''`, or a whitespace-only string). The throttler then bypasses both the custom global limit and any per-endpoint `@ApiRateLimit` rules without incrementing their counters. The IP-based global limit still applies (with scope `'anonymous'`, unless the result is `{ key: null, authenticated: true }`).

```typescript
keyResolver: ({ request, routerDetail }) => {
    if (request.url === '/healthz') return null;                                  // skip health checks
    if (routerDetail.operationId === 'InternalProbeController_ping') return null; // skip by operation id
    const userId = request.headers['auth-user-id'];
    return typeof userId === 'string' && userId.length > 0 ? `user:${userId}` : `ip:${request.ip}`;
}
```

The same identity is used for the custom global limit and for any per-endpoint `@ApiRateLimit` rule. Resolvers may be asynchronous. If the resolver throws, the error propagates through the gateway's existing exception pipeline (no silent allow, no silent deny). If `keyResolver` is omitted, the custom limit falls back to the normalised client IP (matching the IP limit's bucketing key). See `specs/002-throttler-key-callback/quickstart.md` for the full walkthrough.

## Support:

If you encounter any issues, have questions, or need assistance with the API Gateway, please contact the development team

Thank you for using the API Gateway! Happy API management and development!
