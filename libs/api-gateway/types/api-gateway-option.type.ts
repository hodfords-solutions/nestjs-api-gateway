import { ThrottlerOption } from '../throttlers/types/throttler-option.type';
import { ApiServiceDetail } from '../restful/types/api-service.type';
import { RestfulOption } from '../restful/types/restful-option.type';
import { RedisOptionType } from '../redis/types/redis-option.type';
import { McpOption } from '../mcp/types/mcp-option.type';
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
