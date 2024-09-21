import { SetMetadata } from '@nestjs/common';

export const HEADER_HANDLER = 'HEADER_HANDLER';

export function HeaderHandler(priority: number = 1): ClassDecorator {
    return SetMetadata(HEADER_HANDLER, priority);
}
