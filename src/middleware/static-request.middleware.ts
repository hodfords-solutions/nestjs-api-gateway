import { IncomingMessage } from 'http';
import { ProxyValidation, ProxyValidationHandler } from '@hodfords/api-gateway';

@ProxyValidation()
export class StaticRequestMiddleware implements ProxyValidationHandler {
    isStaticRequest(request: IncomingMessage): boolean {
        return request.url.includes('/images/') || request.url.includes('/statics/');
    }
}
