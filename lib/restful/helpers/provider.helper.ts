import { ModulesContainer } from '@nestjs/core';
import { sortBy } from 'lodash';

export function getProviderByMetadata(key: string, modulesContainer: ModulesContainer) {
    const providerModules = [...modulesContainer.values()].map((module) => module.providers.values());

    let handlers: { instance: any; priority: number }[] = [];
    for (const providerModule of providerModules) {
        for (const provider of providerModule) {
            const { instance } = provider;
            if (!instance || !instance.constructor) {
                continue;
            }
            const priority = Reflect.getMetadata(key, instance.constructor);
            if (priority) {
                handlers.push({ instance, priority });
            }
        }
    }
    return sortBy(handlers, ['priority']).map((handler) => handler.instance);
}
