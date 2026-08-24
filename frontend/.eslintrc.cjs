module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],

    // Tracked technical debt, not a defect class.
    //
    // The codebase carries ~680 `any`s. Converting them wholesale is a large,
    // behaviour-risking refactor that belongs in its own change, and leaving it
    // as an error makes `npm run lint` permanently red, which destroys the
    // signal from the rules that DO catch bugs. Demoted to a warning so the
    // count stays visible and can be driven down incrementally.
    '@typescript-eslint/no-explicit-any': 'warn',

    // Real-bug rules stay as errors. Unused values usually mean a handler that
    // was written but never wired to anything, or logic that was computed and
    // then dropped — both of which have turned up as genuine defects here.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],

    // `@ts-ignore` silently swallows type errors even when there is none to
    // swallow; `@ts-expect-error` fails loudly once the underlying issue is
    // fixed, so a stale suppression cannot rot in place.
    '@typescript-eslint/ban-ts-comment': [
      'error',
      { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
    ],
  },
}
