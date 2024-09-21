import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpenApiService } from '../services/open-api.service';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';

@Injectable()
export class UpdateApiDocumentTask {
    private readonly logger = new Logger(UpdateApiDocumentTask.name);

    constructor(
        private swaggerService: OpenApiService,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

    /**
     * Cronjob to update API documents of microservices, run every 10 seconds.
     */
    @Cron(CronExpression.EVERY_10_SECONDS)
    updateApiDoc(): void {
        for (const apiService of this.apiGatewayOption.apiServices) {
            this.swaggerService.getServiceDetail(apiService).catch((error) => {
                this.logger.error(`Health check ${apiService.prefix} failed. ${error.message}`);
            });
        }
    }
}
