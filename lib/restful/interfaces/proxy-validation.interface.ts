import { IncomingMessage } from 'http';

export interface ProxyValidationInterface {
    isStaticRequest(request: IncomingMessage): boolean;
}
