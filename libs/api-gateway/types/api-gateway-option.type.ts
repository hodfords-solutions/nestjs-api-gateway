import { ThrottlerOption } from '../throttlers/types/throttler-option.type.js';
import { ApiServiceDetail } from '../restful/types/api-service.type.js';
import { RestfulOption } from '../restful/types/restful-option.type.js';
import { RedisOptionType } from '../redis/types/redis-option.type.js';
import { McpOption } from '../mcp/types/mcp-option.type.js';
import { Pool } from 'undici';

export type ApiGatewayOption = {
    apiServices: ApiServiceDetail[];
    excludeHeaders: string[];
    openApiSecurityKeys: string[];
    openApiSecurityApiKeys?: string[];
    throttler: ThrottlerOption;
    restful: RestfulOption;
    libraryPath?: string;
    redis: RedisOptionType;
    scalarOptions?: any;
    pool: Pool.Options;
    bypassRoutePrefixes?: string[];
    mcp?: McpOption;
};
