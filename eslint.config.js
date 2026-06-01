const base = require('@hodfords/nestjs-eslint-config');

module.exports = [
    ...base,
    {
        files: ['**/*.spec.ts'],
        rules: {
            'max-lines-per-function': 'off',
            '@typescript-eslint/naming-convention': 'off'
        }
    }
];
