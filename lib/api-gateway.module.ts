import { DynamicModule, Global, Module } from '@nestjs/common';
import { ThrottlerModule } from './throttlers/throttler.module';
import { RestfulModule } from './restful/restful.module';
import { ApiGatewayOption } from './types/api-gateway-option.type';
import { API_GATEWAY_OPTION } from './constants/api-gateway.constant';

@Global()
@Module({})
export class ApiGatewayModule {
    static forRoot(option: ApiGatewayOption): DynamicModule {
        option.libraryPath = __dirname;
        return {
            module: ApiGatewayModule,
            imports: [ThrottlerModule.forRoot(option.throttler), RestfulModule],
            controllers: [],
            providers: [
                {
                    provide: API_GATEWAY_OPTION,
                    useValue: option
                }
            ],
            exports: [
                {
                    provide: API_GATEWAY_OPTION,
                    useValue: option
                }
            ]
        };
    }
}
