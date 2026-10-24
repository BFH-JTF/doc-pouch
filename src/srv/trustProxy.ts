export type TrustProxySetting = boolean | number | string;

const PROXY_ADDR_NAMES = ['loopback', 'linklocal', 'uniquelocal'];

function isProxyAddrName(token: string): boolean {
    return PROXY_ADDR_NAMES.includes(token);
}

function isIpOrSubnet(token: string): boolean {
    if (isProxyAddrName(token)) {
        return true;
    }
    const slashIndex = token.indexOf('/');
    const addr = slashIndex === -1 ? token : token.slice(0, slashIndex);
    const cidr = slashIndex === -1 ? undefined : token.slice(slashIndex + 1);
    if (cidr !== undefined && !/^\d+$/.test(cidr)) {
        return false;
    }
    const subnet = cidr === undefined ? undefined : parseInt(cidr, 10);
    if (addr.includes(':')) {
        if (!/^[0-9a-fA-F:]+$/.test(addr)) {
            return false;
        }
        return subnet === undefined || subnet <= 128;
    }
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) {
        return false;
    }
    return addr.split('.').every(octet => parseInt(octet, 10) <= 255)
        && (subnet === undefined || subnet <= 32);
}

export function resolveTrustProxy(env: NodeJS.ProcessEnv = process.env): TrustProxySetting {
    const raw = env.TRUST_PROXY;
    if (raw === undefined || raw.trim() === '') {
        return 'loopback';
    }
    const value = raw.trim();
    if (value === 'false') {
        return false;
    }
    if (value === 'true') {
        return true;
    }
    if (isProxyAddrName(value)) {
        return value;
    }
    if (/^\d+$/.test(value)) {
        return parseInt(value, 10);
    }
    const tokens = value.split(',').map(token => token.trim()).filter(token => token.length > 0);
    if (tokens.length > 0 && tokens.every(isIpOrSubnet)) {
        return tokens.join(',');
    }
    throw new Error(`Invalid TRUST_PROXY value "${value}". Accepted: loopback, linklocal, uniquelocal, a hop count (e.g. 1), true, false, or a comma-separated list of IP addresses / CIDR subnets (e.g. 10.1.2.3, 192.168.0.0/16).`);
}
