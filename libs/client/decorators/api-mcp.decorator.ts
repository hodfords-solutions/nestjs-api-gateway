import { addApiExtension } from '../helpers/api-extension.js';

export function ApiMcp(description?: string): MethodDecorator {
    return (target: any, key: string | symbol, descriptor: PropertyDescriptor) => {
        addApiExtension(descriptor, 'x-api-mcp', { description });
        return descriptor;
    };
}
