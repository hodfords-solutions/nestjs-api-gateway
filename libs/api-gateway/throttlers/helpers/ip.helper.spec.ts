import { describe, it, expect } from 'vitest';
import { assertValidIpv6Subnet, normalizeIp } from './ip.helper.js';

describe('normalizeIp', () => {
    it('returns IPv4 addresses unchanged', () => {
        expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
    });

    it.each([
        ['::ffff:203.0.113.7', '203.0.113.7'],
        ['::FFFF:203.0.113.7', '203.0.113.7'],
        ['::ffff:cb00:7107', '203.0.113.7'],
        ['0:0:0:0:0:ffff:203.0.113.7', '203.0.113.7']
    ])('strips the IPv4-mapped prefix from %s', (input, expected) => {
        expect(normalizeIp(input)).toBe(expected);
    });

    it('masks IPv6 addresses to their /64 prefix by default', () => {
        expect(normalizeIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2:0:0:0:0/64');
        expect(normalizeIp('2001:db8:1:2::1')).toBe('2001:db8:1:2:0:0:0:0/64');
    });

    it('maps every address in the same /64 to the same key, and different /64s to different keys', () => {
        const a = normalizeIp('2001:db8:1:2::1');
        const b = normalizeIp('2001:0DB8:0001:0002:ffff:ffff:ffff:fffe');
        const c = normalizeIp('2001:db8:1:3::1');
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });

    it('honours a custom subnet, including one that is not a multiple of 16', () => {
        expect(normalizeIp('2001:db8:1:2ff::1', 56)).toBe('2001:db8:1:200:0:0:0:0/56');
        expect(normalizeIp('2001:db8:1:2::1', 48)).toBe('2001:db8:1:0:0:0:0:0/48');
        expect(normalizeIp('2001:db8:1:2::1', 128)).toBe('2001:db8:1:2:0:0:0:1/128');
    });

    it('handles compressed forms at either end and the unspecified/loopback addresses', () => {
        expect(normalizeIp('::1')).toBe('0:0:0:0:0:0:0:0/64');
        expect(normalizeIp('::1', 128)).toBe('0:0:0:0:0:0:0:1/128');
        expect(normalizeIp('fe80::')).toBe('fe80:0:0:0:0:0:0:0/64');
    });

    it('expands an embedded IPv4 tail that is not IPv4-mapped (e.g. NAT64)', () => {
        expect(normalizeIp('64:ff9b::203.0.113.7', 128)).toBe('64:ff9b:0:0:0:0:cb00:7107/128');
    });

    it('drops the zone index', () => {
        expect(normalizeIp('fe80::1%eth0')).toBe('fe80:0:0:0:0:0:0:0/64');
    });

    it('returns non-IP values unchanged', () => {
        expect(normalizeIp('unknown')).toBe('unknown');
        expect(normalizeIp('')).toBe('');
    });
});

describe('assertValidIpv6Subnet', () => {
    it.each([1, 48, 64, 128])('accepts %s', (value) => {
        expect(() => assertValidIpv6Subnet(value)).not.toThrow();
    });

    it.each([0, 129, 64.5, '64', null])('rejects %s', (value) => {
        expect(() => assertValidIpv6Subnet(value)).toThrow(/ipv6Subnet/);
    });
});
