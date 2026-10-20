import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Private verification runtimes and generated Python environments are not Node source.
  { ignores: ['**/dist/**', '**/node_modules/**', '.local/**', '.venv/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
