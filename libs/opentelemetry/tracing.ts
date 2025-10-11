import { OpenTelemetryOptions } from './type';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { IncomingMessage } from 'http';
import { ReadableSpan } from '@opentelemetry/sdk-trace-node';

export function tracing(option: OpenTelemetryOptions) {
    const traceExporter = new OTLPTraceExporter({
        url: `${option.otlpUrl}/v1/traces`
    });

    const sdk = new NodeSDK({
        traceExporter: traceExporter,
        resource: resourceFromAttributes({
            [ATTR_SERVICE_NAME]: option.serviceName
        }),
        instrumentations: [
            getNodeAutoInstrumentations({
                // eslint-disable-next-line @typescript-eslint/naming-convention
                '@opentelemetry/instrumentation-http': {
                    applyCustomAttributesOnSpan: (span, request: IncomingMessage, response) => {
                        const name: string = (span as unknown as ReadableSpan).name;
                        if (name.endsWith('/{*splat}')) {
                            const fullUrl = new URL(request.url, `https://${request.headers.host}`);
                            span.updateName(`${request.method} ${fullUrl.pathname}`);
                        }
                        return span;
                    }
                }
            })
        ]
    });

    sdk.start();
}
