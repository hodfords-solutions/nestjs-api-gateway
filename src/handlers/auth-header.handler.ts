import { IncomingMessage } from 'http';
import { RouterDetail, HeaderHandler, HeaderHandlerInterface } from '@hodfords/api-gateway';

@HeaderHandler()
export class AuthHeaderHandler implements HeaderHandlerInterface {
    /**
     * Get headers of a request and convert to kebab-case
     * @param {RouterDetail} routerDetail Detail of router
     * @param {IncomingMessage} request The request
     * @returns {Promise<NodeJS.Dict<string>>} Object contains header detail
     */
    async handle(routerDetail: RouterDetail, request: IncomingMessage): Promise<NodeJS.Dict<string>> {
        return { authUserId: '123' };
    }
}
