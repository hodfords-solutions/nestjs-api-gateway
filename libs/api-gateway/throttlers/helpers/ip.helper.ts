import { isIPv4, isIPv6 } from 'node:net';

export const DEFAULT_IPV6_SUBNET = 64;

/**
 * Expand an IPv6 address (any textual form, including an embedded IPv4 tail) into its eight
 * 16-bit groups. Returns `undefined` for anything that isn't a valid IPv6 address.
 */
function expandIpv6(address: string): number[] | undefined {
    if (!isIPv6(address)) {
        return undefined;
    }

    let text = address;
    const lastColon = text.lastIndexOf(':');
    const dottedTail = text.slice(lastColon + 1);
    if (isIPv4(dottedTail)) {
        // Rewrite an embedded IPv4 tail (e.g. `64:ff9b::1.2.3.4`) as two hex groups.
        const [a, b, c, d] = dottedTail.split('.').map(Number);
        text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    }

    const toGroups = (part: string): number[] => (part === '' ? [] : part.split(':').map((h) => parseInt(h, 16)));
    const gap = text.indexOf('::');
    let groups: number[];
    if (gap === -1) {
        groups = toGroups(text);
    } else {
        const head = toGroups(text.slice(0, gap));
        const rest = toGroups(text.slice(gap + 2));
        groups = [...head, ...new Array<number>(8 - head.length - rest.length).fill(0), ...rest];
    }

    return groups.length === 8 ? groups : undefined;
}

/**
 * Normalise a client address so equivalent addresses share one rate-limit bucket:
 * - IPv4-mapped IPv6 addresses (`::ffff:1.2.3.4`, `::ffff:102:304`) become the plain IPv4 address.
 * - Other IPv6 addresses are masked to their `/subnet` prefix (default /64, the smallest block
 *   normally assigned to a single subscriber or LAN), so a client cannot dodge a per-IP limit by
 *   rotating through the 2^64 addresses it controls. Pass `128` to keep one bucket per address.
 * - The IPv6 zone index (`fe80::1%eth0`) is dropped.
 * - Anything that is not an IP address (e.g. `'unknown'`) is returned unchanged.
 *
 * IPv6 output is `<eight lowercase hex groups>/<subnet>`, e.g. `2001:db8:1:2:0:0:0:0/64`.
 */
export function normalizeIp(ip: string, ipv6Subnet: number = DEFAULT_IPV6_SUBNET): string {
    if (!ip || isIPv4(ip)) {
        return ip;
    }

    const zoneIndex = ip.indexOf('%');
    const address = zoneIndex === -1 ? ip : ip.slice(0, zoneIndex);
    const groups = expandIpv6(address);
    if (!groups) {
        return ip;
    }

    const isIpv4Mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
    if (isIpv4Mapped) {
        return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');
    }

    const masked = groups.map((group, index) => {
        const bitsInGroup = Math.min(Math.max(ipv6Subnet - index * 16, 0), 16);
        const mask = (0xffff << (16 - bitsInGroup)) & 0xffff;
        return (group & mask).toString(16);
    });
    return `${masked.join(':')}/${ipv6Subnet}`;
}

export function assertValidIpv6Subnet(ipv6Subnet: unknown): void {
    if (!Number.isInteger(ipv6Subnet) || (ipv6Subnet as number) < 1 || (ipv6Subnet as number) > 128) {
        throw new Error(`ThrottlerOption.ipv6Subnet must be an integer between 1 and 128. Received: ${ipv6Subnet}`);
    }
}
