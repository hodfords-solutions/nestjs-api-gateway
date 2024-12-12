import { STRIPE_SIGNATURE } from '../constants/special-headers.constant';

export const rawBodyBufferHelper = (req: any, res: any, buffer: Buffer, encoding: BufferEncoding): void => {
    if (!req.headers[STRIPE_SIGNATURE]) {
        return;
    }

    if (buffer && buffer.length) {
        req.rawBody = buffer.toString(encoding || 'utf8');
    }
};
