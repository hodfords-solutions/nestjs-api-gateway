import 'reflect-metadata';
import { ModulesContainer } from '@nestjs/core';
import { getProviderByMetadata } from './provider.helper';

const METADATA_KEY = 'TEST_PROVIDER_METADATA';

class HandlerA {}
class HandlerB {}
class HandlerC {}
class Unmarked {}

function createContainer(instances: unknown[]): ModulesContainer {
    const providers = new Map(instances.map((instance, index) => [`provider-${index}`, { instance }]));
    return new Map([['module-1', { providers }]]) as unknown as ModulesContainer;
}

describe('getProviderByMetadata', () => {
    afterEach(() => {
        for (const target of [HandlerA, HandlerB, HandlerC]) {
            Reflect.deleteMetadata(METADATA_KEY, target);
        }
    });

    it('returns instances whose constructor carries the metadata key, sorted by priority', () => {
        Reflect.defineMetadata(METADATA_KEY, 2, HandlerA);
        Reflect.defineMetadata(METADATA_KEY, 1, HandlerB);
        Reflect.defineMetadata(METADATA_KEY, 3, HandlerC);

        const [a, b, c] = [new HandlerA(), new HandlerB(), new HandlerC()];
        const result = getProviderByMetadata(METADATA_KEY, createContainer([a, b, c]));

        expect(result).toEqual([b, a, c]);
    });

    it('skips providers without the metadata key', () => {
        Reflect.defineMetadata(METADATA_KEY, 1, HandlerA);
        const a = new HandlerA();
        const result = getProviderByMetadata(METADATA_KEY, createContainer([a, new Unmarked()]));
        expect(result).toEqual([a]);
    });

    it('skips providers without an instance', () => {
        Reflect.defineMetadata(METADATA_KEY, 1, HandlerA);
        const a = new HandlerA();
        const result = getProviderByMetadata(METADATA_KEY, createContainer([a, null, undefined]));
        expect(result).toEqual([a]);
    });

    it('returns an empty array when nothing matches', () => {
        expect(getProviderByMetadata(METADATA_KEY, createContainer([new Unmarked()]))).toEqual([]);
    });
});
