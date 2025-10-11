import { SimpleSpanProcessor, Span } from '@opentelemetry/sdk-trace-base';
import { SpanExporter } from '@opentelemetry/sdk-trace-base/build/src/export/SpanExporter';

export class DurationFilterProcessor extends SimpleSpanProcessor {
    private traceBuffer = new Map();

    constructor(
        exporter: SpanExporter,
        private minDuration: number
    ) {
        super(exporter);
    }

    onStart(currentSpan: Span): void {
        const traceId = currentSpan.spanContext().traceId;
        const spans = this.traceBuffer.get(traceId) || [];
        spans.push(currentSpan);
        this.traceBuffer.set(traceId, spans);
    }

    onEnd(currentSpan: Span): void {
        const traceId = currentSpan.spanContext().traceId;
        if ((currentSpan as any).parentSpanContext) {
            return;
        }
        const duration =
            (currentSpan.endTime[0] - currentSpan.startTime[0]) * 1000 +
            (currentSpan.endTime[1] - currentSpan.startTime[1]) / 1e6;
        if (duration >= this.minDuration) {
            const spans = this.traceBuffer.get(traceId) || [];
            for (const span of spans) {
                super.onEnd(span);
            }
        }
        this.traceBuffer.delete(traceId);
    }
}
