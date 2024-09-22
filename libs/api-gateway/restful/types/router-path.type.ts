export type RateLimit = {
    ttl: number;
    limit: number;
    status: number;
};

export type RouterDetail = {
    path: string;
    isBearerAuth: boolean;
    routerPath: string;
    pathMatch: any; // TODO: Fix this type PathMatch
    rateLimits: RateLimit[];
    extra?: NodeJS.Dict<string>;
};

export type RouterPathType = {
    [key in string]: RouterDetail[];
};
