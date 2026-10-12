import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/unit/**/*.test.ts','tests/integration/**/*.test.ts','tests/server/**/*.test.ts'],fileParallelism:false,maxWorkers:1,testTimeout:30000,hookTimeout:30000}});
