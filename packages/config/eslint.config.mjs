import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { TSDocParser } from '@microsoft/tsdoc';
import { importAllowed } from './layering.mjs';

const rules = {
  layering: {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        forbidden: 'Import violates section 4 layering: {{name}}',
        dynamic:
          'Computed imports cannot be checked against the layering contract.',
      },
    },
    create(context) {
      const check = (node, source, typeOnly) => {
        if (typeof source?.value !== 'string') {
          context.report({ node, messageId: 'dynamic' });
        } else if (!importAllowed(context.filename, source.value, typeOnly)) {
          context.report({
            node,
            messageId: 'forbidden',
            data: { name: source.value },
          });
        }
      };
      return {
        ImportDeclaration(node) {
          check(node, node.source, node.importKind === 'type');
        },
        ExportNamedDeclaration(node) {
          if (node.source) check(node, node.source, node.exportKind === 'type');
        },
        ExportAllDeclaration(node) {
          check(node, node.source, node.exportKind === 'type');
        },
        ImportExpression(node) {
          check(node, node.source, false);
        },
        CallExpression(node) {
          if (
            node.callee.type === 'Identifier' &&
            node.callee.name === 'require'
          )
            check(node, node.arguments[0], false);
        },
      };
    },
  },
  documentation: {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        missing: 'Document this public export with TSDoc.',
        invalid: 'Invalid TSDoc: {{message}}',
      },
    },
    create(context) {
      const parser = new TSDocParser();
      return {
        ExportNamedDeclaration(node) {
          const comment = context.sourceCode.getCommentsBefore(node).at(-1);
          if (
            !comment ||
            comment.type !== 'Block' ||
            !comment.value.startsWith('*')
          ) {
            context.report({ node, messageId: 'missing' });
            return;
          }
          const parsed = parser.parseString(`/*${comment.value}*/`);
          for (const message of parsed.log.messages)
            context.report({
              node,
              messageId: 'invalid',
              data: { message: message.text },
            });
        },
      };
    },
  },
};

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.tmp/**',
      '.agents/**',
      '.claude/**',
      '.codex/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        structuredClone: 'readonly',
        Intl: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['packages/*/src/**/*.ts'],
    plugins: { sleeby: { rules } },
    rules: { 'sleeby/layering': 'error', 'sleeby/documentation': 'error' },
  },
];
