import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals, ...nextTs,
  globalIgnores(['.next/**', 'next-env.d.ts']),
  { rules: { 'no-restricted-imports': ['error', { patterns: [
    { group: ['@prisma/*', '@supabase/*', '@outsaid/api', '@outsaid/api/*', '**/apps/api/**'], message: 'Database and business logic belong in apps/api.' },
  ] }] } },
]);
