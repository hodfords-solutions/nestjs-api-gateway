import { SetMetadata } from '@nestjs/common';

export const WS_HEADER_HANDLER = 'WS_HEADER_HANDLER';

export function WsHeaderHandler(priority: number = 1): ClassDecorator {
    return SetMetadata(WS_HEADER_HANDLER, priority);
}
