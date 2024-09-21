import { IncomingMessage } from 'http';
import { WsHeaderHandler, WsHeaderHandlerInterface } from '@hodfords/api-gateway';

@WsHeaderHandler()
export class WsAuthHeaderHandler implements WsHeaderHandlerInterface {
    /**
     * Get headers of a request and convert to kebab-case
     * @param {IncomingMessage} request The request
     * @returns {Promise<NodeJS.Dict<string>>} Object contains header detail
     */
    async handle(request: IncomingMessage): Promise<NodeJS.Dict<string>> {
        return { authUserId: '123' };
    }
}
