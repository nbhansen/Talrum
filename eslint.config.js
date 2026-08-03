import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

// Layer map (#397): app → features → widgets/layouts → ui/lib → theme/types/glyphs.
// One declaration, one rule. eslint-plugin-boundaries classifies the RESOLVED
// target file, so alias (`@/lib/supabase`) and relative (`../../lib/supabase`)
// imports hit the same policy — the bypass the old `no-restricted-imports`
// blocks had. Policies evaluate top to bottom and the LAST match wins, so the
// file reads: broad allows first, named bans with messages next, narrow
// exceptions last.
const layerElements = [
  // Order matters: first matching descriptor wins, so the lib sub-folders
  // must come before the `lib` catch-all.
  { type: 'app', pattern: 'src/app' },
  { type: 'feature', pattern: 'src/features/*', capture: ['feature'] },
  { type: 'widgets', pattern: 'src/widgets' },
  { type: 'layouts', pattern: 'src/layouts' },
  { type: 'ui', pattern: 'src/ui' },
  { type: 'lib-queries', pattern: 'src/lib/queries' },
  { type: 'lib-outbox', pattern: 'src/lib/outbox' },
  { type: 'lib-storage', pattern: 'src/lib/storage' },
  { type: 'lib', pattern: 'src/lib' },
  { type: 'theme', pattern: 'src/theme' },
  { type: 'types', pattern: 'src/types' },
  { type: 'glyphs', pattern: 'src/glyphs' },
  { type: 'assets', pattern: 'src/assets' },
];

// Orthogonal per-file tags for the rules that key on a single file, not a
// folder: the supabase client and the PIN store are files at the lib root,
// and AuthGate is the sole app/ file allowed to touch the client (#126/#148).
const fileCategories = [
  { category: 'supabase-client', pattern: 'src/lib/supabase.ts' },
  { category: 'pin', pattern: 'src/lib/pin.ts' },
  { category: 'auth-gate', pattern: 'src/app/AuthGate.tsx' },
  // Tests and test-utils follow the layer rules of the folder they live in
  // (they had NO boundary enforcement before #397), with one relaxation
  // granted below: they may import from app/ to mount providers.
  { category: 'test', pattern: ['**/*.test.ts', '**/*.test.tsx', '**/*.test-utils.tsx'] },
];

const SUPABASE_PLUMBING_MSG =
  'The supabase client is data-layer plumbing: reads go through @/lib/queries, writes through @/lib/outbox, storage through @/lib/storage (docs/queries.md). AuthGate is the sole app/ exception.';

const allLib = ['lib', 'lib-queries', 'lib-outbox', 'lib-storage'];
const sharedBottom = ['theme', 'types', 'glyphs'];

const layerPolicies = [
  // ---- The layer map: what each tier MAY import. ----
  {
    from: { element: { type: 'app' } },
    allow: {
      to: {
        element: {
          types: {
            anyOf: ['feature', 'widgets', 'layouts', 'ui', ...allLib, ...sharedBottom, 'assets'],
          },
        },
      },
    },
  },
  {
    from: { element: { type: 'feature' } },
    allow: {
      to: {
        element: {
          types: { anyOf: ['widgets', 'layouts', 'ui', ...allLib, ...sharedBottom, 'assets'] },
        },
      },
    },
  },
  {
    from: { element: { types: { anyOf: ['widgets', 'layouts'] } } },
    allow: {
      to: {
        element: {
          types: { anyOf: ['widgets', 'layouts', 'ui', ...allLib, ...sharedBottom, 'assets'] },
        },
      },
    },
  },
  {
    // ui/ is the dumb tier (#282): presentational primitives only. Plain lib
    // helpers are fine; the domain sub-folders are banned by name below.
    from: { element: { type: 'ui' } },
    allow: {
      to: { element: { types: { anyOf: ['ui', 'lib', ...sharedBottom, 'assets'] } } },
    },
  },
  {
    from: { element: { types: { anyOf: allLib } } },
    allow: { to: { element: { types: { anyOf: [...allLib, ...sharedBottom] } } } },
  },
  {
    from: { element: { types: { anyOf: sharedBottom } } },
    allow: { to: { element: { types: { anyOf: [...sharedBottom, 'lib'] } } } },
  },

  // ---- Named bans, so the frequent mistakes get a teaching message. ----
  // (Everything not allowed above is already banned by `default: "disallow"`;
  // these only replace the generic message.)
  {
    from: { element: { type: '*' } },
    disallow: { to: { element: { type: 'app' } } },
    message:
      'Reverse import: shared layers MUST NOT import from app/. Move the consumed surface down a layer (e.g. session hooks live in @/lib/auth/session).',
  },
  {
    from: {
      element: { types: { anyOf: [...allLib, ...sharedBottom, 'widgets', 'layouts', 'ui'] } },
    },
    disallow: { to: { element: { type: 'feature' } } },
    message:
      'Reverse import: shared layers MUST NOT import from features/. Lift the consumed surface into lib/, ui/, or widgets/.',
  },
  {
    from: { element: { type: 'feature' } },
    disallow: { to: { element: { type: 'feature' } } },
    message:
      'No cross-feature imports. Compose features at the route layer; lift shared code to lib/, ui/, or layouts/.',
  },
  {
    from: { element: { types: { anyOf: [...allLib, ...sharedBottom] } } },
    disallow: { to: { element: { types: { anyOf: ['widgets', 'layouts', 'ui'] } } } },
    message:
      'Reverse import: lib/theme/types/glyphs MUST NOT import UI layers. Move the shared logic further down instead.',
  },
  {
    from: { element: { type: 'ui' } },
    disallow: { to: { element: { type: 'widgets' } } },
    message:
      'Reverse import: ui/ primitives MUST NOT import query-aware widgets. Compose them one layer up (widgets/ or features/).',
  },
  {
    from: { element: { type: 'ui' } },
    disallow: {
      to: [
        { element: { types: { anyOf: ['lib-queries', 'lib-outbox', 'lib-storage'] } } },
        { file: { categories: 'pin' } },
      ],
    },
    message:
      'ui/ is domain-agnostic — no data access. A component that needs lib/queries, lib/outbox, lib/storage, or lib/pin is a domain widget; move it to src/widgets/ (#282).',
  },
  {
    from: { element: { type: '*' } },
    disallow: { to: { file: { categories: 'supabase-client' } } },
    message: SUPABASE_PLUMBING_MSG,
  },

  // ---- Narrow exceptions. Last match wins, so these go at the end. ----
  {
    // lib/ owns the client: queries, outbox, storage, and auth wrap it.
    from: { element: { types: { anyOf: allLib } } },
    allow: { to: { file: { categories: 'supabase-client' } } },
  },
  {
    // AuthGate is the centralized auth subscriber (#126/#148).
    from: { file: { categories: 'auth-gate' } },
    allow: { to: { file: { categories: 'supabase-client' } } },
  },
  {
    // Tests mount the real provider tree: session.test-utils renders
    // @/app/SessionProvider. Everything else (supabase client, cross-feature,
    // ui domain bans) applies to tests unchanged.
    from: { file: { categories: 'test' } },
    allow: { to: { element: { type: 'app' } } },
  },
];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'src/types/supabase.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict, ...tseslint.configs.stylistic],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        HTMLElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLDivElement: 'readonly',
        KeyboardEvent: 'readonly',
      },
    },
    plugins: {
      boundaries,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'simple-import-sort': simpleImportSort,
    },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/elements': layerElements,
      'boundaries/files': fileCategories,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message:
            'Import violates the layer map (app → features → widgets/layouts → ui/lib → theme/types/glyphs). {{from.element.types.[0]}} may not import {{to.element.types.[0]}} — see the README architecture section and eslint.config.js.',
          policies: layerPolicies,
        },
      ],
      // #218: prevent side-effect imports of .module.css — prod minification
      // drops their rules. Global CSS belongs in a plain .css file.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportDeclaration[specifiers.length=0][source.value=/\\.module\\.css$/]',
          message:
            'Side-effect import of a .module.css file. CSS Modules must be imported as `import styles from ...`. For global CSS, rename to plain .css.',
        },
      ],
    },
  },
);
