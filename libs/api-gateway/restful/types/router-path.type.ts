export type RateLimit = {
    ttl: number;
    limit: number;
    status: number;
};

export type RouterDetail = {
    operationId: string;
    description: string;
    path: string;
    isBearerAuth: boolean;
    isApiKeyAuth: boolean;
    routerPath: string;
    pathMatch: any; // TODO: Fix this type PathMatch
    rateLimits: RateLimit[];
    extra?: NodeJS.Dict<any>;
};

export type RouterPathType = {
    [key in string]: RouterDetail[];
};
