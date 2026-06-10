import { rawBodyBufferHelper } from './raw-body-buffer.helper';
import { STRIPE_SIGNATURE } from '../constants/special-headers.constant';

describe('rawBodyBufferHelper', () => {
    it('stores the raw body when the stripe signature header is present', () => {
        const req: any = { headers: { [STRIPE_SIGNATURE]: 'sig' } };
        rawBodyBufferHelper(req, {}, Buffer.from('{"a":1}'), 'utf8');
        expect(req.rawBody).toBe('{"a":1}');
    });

    it('defaults to utf8 when no encoding is given', () => {
        const req: any = { headers: { [STRIPE_SIGNATURE]: 'sig' } };
        rawBodyBufferHelper(req, {}, Buffer.from('payload'), undefined as never);
        expect(req.rawBody).toBe('payload');
    });

    it('does nothing without the stripe signature header', () => {
        const req: any = { headers: {} };
        rawBodyBufferHelper(req, {}, Buffer.from('payload'), 'utf8');
        expect(req.rawBody).toBeUndefined();
    });

    it('does nothing for an empty buffer', () => {
        const req: any = { headers: { [STRIPE_SIGNATURE]: 'sig' } };
        rawBodyBufferHelper(req, {}, Buffer.alloc(0), 'utf8');
        expect(req.rawBody).toBeUndefined();
    });
});
