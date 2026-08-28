import { DynamicModule, Module } from '@nestjs/common';
import { ThrottlerService } from './services/throttler.service.js';
import { ThrottlerOption } from './types/throttler-option.type.js';
import { THROTTLER_OPTION } from './constants/rate-limit.constant.js';

@Module({})
export class ThrottlerModule {
    static forRoot(options: ThrottlerOption): DynamicModule {
        return {
            global: true,
            module: ThrottlerModule,
            providers: [
                ThrottlerService,
                {
                    provide: THROTTLER_OPTION,
                    useValue: options
                }
            ],
            exports: [ThrottlerService]
        };
    }
}
