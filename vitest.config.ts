import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    // Include both src-colocated tests and the new tests/unit folder
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.property.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.property.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.property.test.ts',
        'src/app/**',    // Next.js page/layout files — cover via E2E
        'src/workers/**', // BullMQ workers — cover via integration
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/types': path.resolve(__dirname, './src/types'),
    },
  },
});
