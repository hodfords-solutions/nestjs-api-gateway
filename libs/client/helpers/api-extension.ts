import { DECORATORS } from '@nestjs/swagger/dist/constants';

export function addApiExtension(descriptor: PropertyDescriptor, key: string, value: any): PropertyDescriptor {
    const apiExtension = Reflect.getMetadata(DECORATORS.API_EXTENSION, descriptor.value) || {};
    Reflect.defineMetadata(
        DECORATORS.API_EXTENSION,
        {
            ...apiExtension,
            [key]: [...(apiExtension[key] || []), value]
        },
        descriptor.value
    );

    return descriptor;
}
