import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/**
 * What this is for.
 *
 * TypeScript already checks that the code fits together; it cannot see a
 * mistake that is still perfectly typed. The one that took every product page
 * on the shop down was exactly that: two React hooks declared below an early
 * return, which types fine and fails the moment the second render reaches
 * them. It was live before anybody could have noticed.
 *
 * So this is set up to catch mistakes, not to have opinions. Nothing here is
 * about quotes, semicolons, spacing or import order: a rule that fires on
 * something harmless trains everyone to ignore the ones that matter, and on a
 * codebase this size it would have produced hundreds of them on the first run.
 * Every rule below either marks real broken behaviour or a real risk of it.
 *
 * Run it with `npm run lint`.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/generated/**',
      'client/public/**',
      'server/prisma/migrations/**',
      'scripts/**',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      /*
       * Turned off because TypeScript already says it, and says it better.
       * Leaving them on means the same mistake is reported twice, in two
       * different vocabularies.
       */
      'no-undef': 'off',
      'no-unused-vars': 'off',

      /*
       * An unused name is usually a leftover rather than a fault, so it is
       * worth seeing but not worth stopping a release for. The underscore
       * escape is for the arguments you must accept and do not want.
       */
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],

      /*
       * `any` is a decision, not an accident, and there is a fair amount of it
       * where this code meets free-form JSON from the database. Flagging every
       * one would bury everything else.
       */
      '@typescript-eslint/no-explicit-any': 'off',

      /* An empty catch is how a failure disappears without trace. */
      'no-empty': ['error', { allowEmptyCatch: false }],

      /* Reassigning a parameter changes something the caller still holds. */
      'no-param-reassign': ['error', { props: false }],

      /* `==` across types is the source of comparisons that quietly disagree. */
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      /* A promise nobody waits for fails silently and out of order. */
      'no-async-promise-executor': 'error',

      /*
       * require-atomic-updates is off, having been measured rather than
       * assumed. It found three things and all three were fine: an Express
       * middleware setting req.user, where every request holds its own req,
       * and two caches where the worst a collision costs is one redundant
       * SMTP check or one redundant favicon render. The rule cannot tell a
       * per-request object from shared state, so on this codebase it only
       * teaches people to scroll past errors.
       */
      'require-atomic-updates': 'off',

      /* Two cases of the same thing: one of them never runs. */
      'no-duplicate-case': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',

      /* Left behind after debugging, and left running in front of customers. */
      'no-debugger': 'error',
      'no-alert': 'error',
    },
  },

  /*
   * The React rules, on the client only.
   *
   * rules-of-hooks is the reason this file exists. It is an error, never a
   * warning: breaking it does not degrade a page, it takes the page down.
   *
   * exhaustive-deps is a warning on purpose. It is right most of the time and
   * wrong often enough -- a dependency deliberately left out to run something
   * once -- that making it an error would mean arguing with it in code that is
   * already correct.
   */
  {
    files: ['client/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, react, 'jsx-a11y': jsxA11y },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      /*
       * Only the two rules this codebase already asks for.
       *
       * Both plugins ship a long list; these are the ones the code reaches for
       * by name, in comments written long before this file existed, and
       * without the plugins installed every one of those comments was itself
       * an error -- twenty-three of them, each saying a rule did not exist.
       *
       * A key taken from an array index is only wrong when the list can be
       * reordered or added to in the middle, which is why each place that does
       * it has a comment saying so. A warning keeps the next one honest
       * without re-litigating the ones already decided.
       */
      'react/no-array-index-key': 'warn',
      'jsx-a11y/media-has-caption': 'warn',
    },
  },

  /* The server is Node: console output there is how it reports for duty. */
  {
    files: ['server/src/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
