import { ProxyRequest } from './proxy-request.model';

describe('ProxyRequest', () => {
    it('starts with no headers', () => {
        expect(new ProxyRequest().headers).toEqual({});
    });

    it('addHeader sets a single header', () => {
        const proxyRequest = new ProxyRequest();
        proxyRequest.addHeader('authUserId', '123');
        expect(proxyRequest.headers).toEqual({ authUserId: '123' });
    });

    it('addHeaders merges headers, later values winning', () => {
        const proxyRequest = new ProxyRequest();
        proxyRequest.addHeader('a', '1');
        proxyRequest.addHeaders({ a: '2', b: '3' });
        expect(proxyRequest.headers).toEqual({ a: '2', b: '3' });
    });

    it('getKebabHeaders converts keys to kebab-case', () => {
        const proxyRequest = new ProxyRequest();
        proxyRequest.addHeaders({ authUserId: '123', xTraceId: 'abc' });
        expect(proxyRequest.getKebabHeaders()).toEqual({ 'auth-user-id': '123', 'x-trace-id': 'abc' });
    });
});
