import { ThrottlerOption } from '../throttlers/types/throttler-option.type';
import { ApiServiceDetail } from '../restful/types/api-service.type';
import { RestfulOption } from '../restful/types/restful-option.type';

export type ApiGatewayOption = {
    apiServices: ApiServiceDetail[];
    excludeHeaders: string[];
    openApiSecurityKeys: string[];
    throttler: ThrottlerOption;
    restful: RestfulOption;
    libraryPath?: string;
};
