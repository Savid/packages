require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  overrides: [
    {
      files: ['*.ts', '*.js', '*.mjs'],
      plugins: ['@typescript-eslint', 'import', 'prettier', 'jest'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
      ],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        project: './tsconfig.json',
        sourceType: 'module',
        createDefaultProgram: true,
      },
      settings: {
        'import/parsers': {
          '@typescript-eslint/parser': ['.ts', '.js', '.mjs'],
        },
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
            project: './tsconfig.json',
          },
        },
      },
      rules: {
        'prettier/prettier': [
          'error',
          {
            singleQuote: true,
            trailingComma: 'all',
            printWidth: 100,
            proseWrap: 'never',
          },
        ],
        radix: ['error', 'as-needed'],
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'import/prefer-default-export': 'off',
        'import/no-duplicates': 'error',
        'import/no-extraneous-dependencies': ['error'],
        'import/order': [
          'error',
          {
            groups: ['builtin', 'external', 'internal'],
            pathGroups: [
              {
                pattern: '#**/*',
                group: 'internal',
                position: 'after',
              },
            ],
            'newlines-between': 'always',
            alphabetize: {
              order: 'asc',
              caseInsensitive: true,
            },
          },
        ],
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': 'allow-with-description',
            'ts-nocheck': false,
            'ts-check': true,
            minimumDescriptionLength: 10,
          },
        ],
      },
    },
    {
      files: ['jest.config.js', 'src/**/*.test.ts', '__mocks__/**/*.ts'],
      parserOptions: { project: ['./tsconfig.test.json'] },
    },
  ],
};
