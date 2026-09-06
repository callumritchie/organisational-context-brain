import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ['src/modules/**/*.ts', 'src/modules/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**'],
              message: 'Domain modules must not depend on the application/UI layer.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'components/ui/**', 'hooks/**']),
]);
