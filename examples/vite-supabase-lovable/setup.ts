/**
 * Global test setup — PRODUCTION GUARD (Vitest entry point).
 * Runs BEFORE any test file loads. Re-exports assertNotProduction so existing
 * imports of it from './setup' keep working.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { assertNotProduction } from './production-guard';

export { assertNotProduction };

assertNotProduction();

afterEach(() => {
  cleanup();
});
