import { addApiExtension } from '../helpers/api-extension';

export function ApiRateLimit(limit: number, ttl: number, status?: number): MethodDecorator {
    return (target: any, key: string | symbol, descriptor: PropertyDescriptor) => {
        addApiExtension(descriptor, 'x-rate-limits', { limit, ttl, status });
        return descriptor;
    };
}
