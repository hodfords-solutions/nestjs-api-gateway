import { OpenTelemetryOptions } from './type.js';
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
                    applyCustomAttributesOnSpan: (span, request, response) => {
                        const name: string = (span as unknown as ReadableSpan).name;
                        // The hook also fires for outgoing ClientRequests; only inbound messages carry url + headers.
                        if (name.endsWith('/{*splat}') && request instanceof IncomingMessage && request.url) {
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
