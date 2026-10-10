import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['dist/**','public/tracker*.js','node_modules/**','playwright-report/**','test-results/**','coverage/**','data/**','.baize/**']}, ...tseslint.configs.recommended, {rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}});
