import { describe, it, expect } from 'vitest';
import * as packageRoot from './index.js';
import { DEFAULT_IPV6_SUBNET, normalizeIp } from './index.js';
import { RATE_LIMIT_KEY } from './throttlers/constants/rate-limit.constant.js';

describe('package root exports', () => {
    it('exposes the IP normalisation the throttler uses for its keys', () => {
        expect(typeof packageRoot.normalizeIp).toBe('function');
        expect(DEFAULT_IPV6_SUBNET).toBe(64);
        expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
        expect(normalizeIp('2001:db8:1:2::abcd')).toBe('2001:db8:1:2:0:0:0:0/64');
        expect(normalizeIp('2001:db8:1:2::abcd', 128)).toBe('2001:db8:1:2:0:0:0:abcd/128');
    });

    it('lets a consumer rebuild the throttler IP keys from request.ip', () => {
        // Mirrors ThrottlerService.getGlobalIpKey / getAnonymousIpKey with the default ipv6Subnet.
        expect(`${RATE_LIMIT_KEY}-ip-${normalizeIp('::ffff:203.0.113.7')}`).toBe('rate-limit--ip-203.0.113.7');
        expect(`${RATE_LIMIT_KEY}-anonymous-ip-${normalizeIp('2001:db8::1')}`).toBe(
            'rate-limit--anonymous-ip-2001:db8:0:0:0:0:0:0/64'
        );
    });

    it('does not expose internal helpers', () => {
        expect('assertValidIpv6Subnet' in packageRoot).toBe(false);
    });
});
