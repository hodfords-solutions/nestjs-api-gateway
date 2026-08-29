import { IncomingMessage } from 'http';
import { ProxyValidation, ProxyValidationHandler } from '../../libs/api-gateway/index.js';

@ProxyValidation()
export class StaticRequestMiddleware implements ProxyValidationHandler {
    isStaticRequest(request: IncomingMessage): boolean {
        return !!request.url && (request.url.includes('/images/') || request.url.includes('/statics/'));
    }
}
