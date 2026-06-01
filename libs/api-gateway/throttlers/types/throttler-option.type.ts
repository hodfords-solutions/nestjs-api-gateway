import type { Request } from 'express';
import type { RouterDetail } from '../../restful/types/router-path.type';

export type ThrottlerKeyResolverContext = {
    request: Request;
    routerDetail: RouterDetail;
};

export type ThrottlerKeyResolver = (
    context: ThrottlerKeyResolverContext
) => string | null | undefined | Promise<string | null | undefined>;

export type ThrottlerOption = {
    globalIpRateLimit: number;
    globalIpRateLimitTTL: number;
    globalCustomRateLimit: number;
    globalCustomRateLimitTTL: number;
    isEnable: boolean;
    keyResolver?: ThrottlerKeyResolver;
};
