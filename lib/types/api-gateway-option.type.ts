import { ThrottlerOption } from '../throttlers/types/throttler-option.type';
import { ApiServiceDetail } from '../restful/types/api-service.type';

export type ApiGatewayOption = {
    apiServices: ApiServiceDetail[];
    excludeHeaders: string[];
    openApiSecurityKeys: string[];
    throttler: ThrottlerOption;
    libraryPath?: string;
};
