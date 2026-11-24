// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const perfectionist = require('eslint-plugin-perfectionist');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      perfectionist.configs['recommended-natural'],
    ],
    processor: angular.processInlineTemplates,
    rules: {
      'perfectionist/sort-objects': [
        'error',
        {
          customGroups: [
            { elementNamePattern: '^type$', groupName: 'type' },
            {
              elementNamePattern: '^\w+[Ii]d$',
              groupName: 'id',
            },
          ],
          groups: ['type', 'id', 'unknown'],
          type: 'natural',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {},
  },
  prettier,
  {
    ignores: ['dist/**/*'],
  },
]);
