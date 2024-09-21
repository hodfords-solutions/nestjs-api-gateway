import { RouterDetail } from '@hodfords/api-gateway';
import { IncomingMessage } from 'http';

export interface HeaderHandlerInterface {
    handle(routerDetail: RouterDetail, request: IncomingMessage): Promise<NodeJS.Dict<string>>;
}
