import { IncomingMessage } from 'http';
import { ProxyValidation, ProxyValidationInterface } from '@hodfords/api-gateway';

@ProxyValidation()
export class StaticRequestHandler implements ProxyValidationInterface {
    isStaticRequest(request: IncomingMessage): boolean {
        return request.url.includes('/images/') || request.url.includes('/statics/');
    }
}
