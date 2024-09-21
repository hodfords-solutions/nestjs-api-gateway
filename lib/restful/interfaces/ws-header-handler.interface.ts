import { IncomingMessage } from 'http';

export interface WsHeaderHandlerInterface {
    handle(request: IncomingMessage): Promise<NodeJS.Dict<string>>;
}
