import { MatchFunction } from 'path-to-regexp';

export type RateLimit = {
    ttl: number;
    limit: number;
    status: number;
};

export type RouterDetail = {
    path: string;
    isBearerAuth: boolean;
    routerPath: string;
    pathMatch: MatchFunction;
    rateLimits: RateLimit[];
    allowPendingUser: boolean;
};

export type RouterPathType = {
    [key in string]: RouterDetail[];
};
