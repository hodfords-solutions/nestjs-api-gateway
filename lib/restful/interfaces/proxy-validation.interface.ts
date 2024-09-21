import { IncomingMessage } from 'http';

export interface ProxyValidationHandler {
    isStaticRequest(request: IncomingMessage): boolean;
}
