const tsParser = require('@typescript-eslint/parser');
const tslint = require('typescript-eslint');
const prettierConfig = require('eslint-plugin-prettier/recommended');

const defaultConfigs = {
    files: ['src/**/*.ts', 'lib/**/*.ts']
};
module.exports = [
    ...tslint.config({
        extends: [...tslint.configs.recommended],
        rules: {
            '@typescript-eslint/naming-convention': [
                'error',
                { selector: 'enumMember', format: ['UPPER_CASE'] },
                {
                    selector: ['objectLiteralProperty'],
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE']
                },
                {
                    selector: [
                        'parameter',
                        'variable',
                        'function',
                        'classProperty',
                        'typeProperty',
                        'parameterProperty',
                        'classMethod',
                        'objectLiteralMethod',
                        'typeMethod'
                    ],
                    format: ['camelCase']
                },
                {
                    selector: ['class', 'interface', 'enum'],
                    format: ['PascalCase']
                },
                {
                    selector: ['variable'],
                    modifiers: ['exported'],
                    format: ['PascalCase', 'camelCase', 'UPPER_CASE']
                },
                {
                    selector: ['function'],
                    modifiers: ['exported'],
                    format: ['PascalCase', 'camelCase']
                }
            ],
            '@typescript-eslint/interface-name-prefix': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-inferrable-types': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }]
        },
        ...defaultConfigs
    }),
    {
        ...prettierConfig,
        ...defaultConfigs,
        rules: {
            'prettier/prettier': [
                'error',
                {
                    useTabs: false,
                    tabWidth: 4,
                    printWidth: 120,
                    singleQuote: true,
                    trailingComma: 'none'
                }
            ]
        }
    },
    {
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: 'tsconfig.json',
                sourceType: 'module'
            }
        },
        rules: {
            'max-lines': [
                'error',
                {
                    max: 400,
                    skipComments: true
                }
            ],
            'max-lines-per-function': [
                'error',
                {
                    max: 50,
                    skipComments: true
                }
            ],
            indent: 'off',
            'prefer-const': 'error',
            'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }]
        },
        ...defaultConfigs
    }
];
