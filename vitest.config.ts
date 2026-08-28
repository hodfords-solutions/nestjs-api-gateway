import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        swc.vite({
            module: { type: 'es6' },
            jsc: {
                target: 'es2023',
                parser: { syntax: 'typescript', decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true }
            }
        })
    ],
    test: {
        globals: true,
        environment: 'node',
        include: ['{tests,test,lib,libs,src}/**/*.{spec,test}.ts'],
        setupFiles: ['./vitest.setup.ts'],
        testTimeout: 450_000,
        passWithNoTests: true,
        coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['libs/**/*.ts', 'src/**/*.ts'] }
    }
});
