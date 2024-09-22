import { HttpException, HttpStatus } from '@nestjs/common';

export class TooManyRequestException extends HttpException {
    constructor(message?: string, args?: any) {
        super({ message: message || 'error.too_many_requests', args }, HttpStatus.TOO_MANY_REQUESTS);
    }
}
