import { SetMetadata } from '@nestjs/common';

export const PROXY_VALIDATION = 'PROXY_VALIDATION';

export function ProxyValidation(priority: number = 1): ClassDecorator {
    return SetMetadata(PROXY_VALIDATION, priority);
}
