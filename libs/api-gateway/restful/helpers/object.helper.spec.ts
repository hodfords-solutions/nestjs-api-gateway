import { kebabConvertKeys } from './object.helper';

describe('kebabConvertKeys', () => {
    it('converts camelCase keys to kebab-case', () => {
        expect(kebabConvertKeys({ authUserId: '1', xRequestId: 'abc' })).toEqual({
            'auth-user-id': '1',
            'x-request-id': 'abc'
        });
    });

    it('converts snake_case keys to kebab-case', () => {
        expect(kebabConvertKeys({ auth_user_id: '1' })).toEqual({ 'auth-user-id': '1' });
    });

    it('leaves already-kebab-case keys unchanged', () => {
        expect(kebabConvertKeys({ 'auth-user-id': '1' })).toEqual({ 'auth-user-id': '1' });
    });

    it('keeps values untouched', () => {
        const value = { nested: true };
        const result = kebabConvertKeys<{ 'some-key': object }>({ someKey: value });
        expect(result['some-key']).toBe(value);
    });

    it('returns an empty object for an empty input', () => {
        expect(kebabConvertKeys({})).toEqual({});
    });

    it('returns consistent results across repeated calls (memoized keys)', () => {
        for (let i = 0; i < 3; i++) {
            expect(kebabConvertKeys({ authUserId: String(i) })).toEqual({ 'auth-user-id': String(i) });
        }
    });
});
