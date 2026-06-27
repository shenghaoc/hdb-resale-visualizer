import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    // Agent/editor doc packs and generated artifacts stay out of the
    // formatter, mirroring the lint ignore list below.
    ignorePatterns: [
      ".agents",
      ".claude",
      ".gemini",
      ".jules",
      ".kiro",
      "docs/archive",
      "pnpm-lock.yaml",
      "public/data",
      "tests/fixtures/public-data",
    ],
  },
  lint: {
    plugins: ["oxc", "typescript", "unicorn", "react"],
    categories: {
      correctness: "warn",
    },
    env: {
      builtin: true,
    },
    ignorePatterns: [
      "dist",
      "coverage",
      "playwright-report",
      "test-results",
      "scratch.tsx",
      ".agents",
      ".kiro",
      ".claude",
      ".gemini",
      ".jules",
      "docs/archive",
      "public/data",
      "tests/e2e/**",
    ],
    overrides: [
      {
        files: ["**/*.{js,mjs,cjs,ts,tsx}"],
        rules: {
          "constructor-super": "off",
          "for-direction": "error",
          "getter-return": "off",
          "no-async-promise-executor": "error",
          "no-case-declarations": "error",
          "no-class-assign": "off",
          "no-compare-neg-zero": "error",
          "no-cond-assign": "error",
          "no-const-assign": "off",
          "no-constant-binary-expression": "error",
          "no-constant-condition": "error",
          "no-control-regex": "error",
          "no-debugger": "error",
          "no-delete-var": "error",
          "no-dupe-class-members": "off",
          "no-dupe-else-if": "error",
          "no-dupe-keys": "off",
          "no-duplicate-case": "error",
          "no-empty": "error",
          "no-empty-character-class": "error",
          "no-empty-pattern": "error",
          "no-empty-static-block": "error",
          "no-ex-assign": "error",
          "no-extra-boolean-cast": "error",
          "no-fallthrough": "error",
          "no-func-assign": "off",
          "no-global-assign": "error",
          "no-import-assign": "off",
          "no-invalid-regexp": "error",
          "no-irregular-whitespace": "error",
          "no-loss-of-precision": "error",
          "no-misleading-character-class": "error",
          "no-new-native-nonconstructor": "off",
          "no-nonoctal-decimal-escape": "error",
          "no-obj-calls": "off",
          "no-prototype-builtins": "error",
          "no-redeclare": "off",
          "no-regex-spaces": "error",
          "no-self-assign": "error",
          "no-setter-return": "off",
          "no-shadow-restricted-names": "error",
          "no-sparse-arrays": "error",
          "no-this-before-super": "off",
          "no-undef": "off",
          "no-unexpected-multiline": "error",
          "no-unreachable": "off",
          "no-unsafe-finally": "error",
          "no-unsafe-negation": "off",
          "no-unsafe-optional-chaining": "error",
          "no-unused-labels": "error",
          "no-unused-private-class-members": "error",
          "no-unused-vars": "error",
          "no-useless-assignment": "error",
          "no-useless-backreference": "error",
          "no-useless-catch": "error",
          "no-useless-escape": "error",
          "no-with": "off",
          "preserve-caught-error": "error",
          "require-yield": "error",
          "use-isnan": "error",
          "valid-typeof": "error",
          "no-var": "error",
          "prefer-const": "error",
          "prefer-rest-params": "error",
          "prefer-spread": "error",
          "no-array-constructor": "error",
          "no-unused-expressions": "error",
          "typescript/ban-ts-comment": "error",
          "typescript/no-duplicate-enum-values": "error",
          "typescript/no-empty-object-type": "error",
          "typescript/no-explicit-any": "error",
          "typescript/no-extra-non-null-assertion": "error",
          "typescript/no-misused-new": "error",
          "typescript/no-namespace": "error",
          "typescript/no-non-null-asserted-optional-chain": "error",
          "typescript/no-require-imports": "error",
          "typescript/no-this-alias": "error",
          "typescript/no-unnecessary-type-constraint": "error",
          "typescript/no-unsafe-declaration-merging": "error",
          "typescript/no-unsafe-function-type": "error",
          "typescript/no-wrapper-object-types": "error",
          "typescript/prefer-as-const": "error",
          "typescript/prefer-namespace-keyword": "error",
          "typescript/triple-slash-reference": "error",
        },
        env: {
          browser: true,
          node: true,
        },
      },
      {
        files: ["**/*.{ts,tsx}"],
        rules: {
          "react-hooks/rules-of-hooks": "error",
          "react-hooks/exhaustive-deps": "warn",
          "react/only-export-components": [
            "warn",
            {
              allowConstantExport: true,
            },
          ],
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      manifest: false,
      includeAssets: [
        "favicon.ico",
        "og-card.png",
        "manifest.webmanifest",
        "icons/pwa-192.svg",
        "icons/pwa-512.svg",
        "icons/apple-touch-icon.png",
      ],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/og\//],
        runtimeCaching: [
          {
            // Workbox RegExpRoute execs against url.href, so a `^/api/`-anchored
            // pattern never matches `https://host/api/...`. Match on pathname.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "hdb-api-get-v1",
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                // /api/* is same-origin, so opaque (0) responses never occur.
                statuses: [200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    // Vite 8: use tsconfig paths instead of manual alias duplication
    tsconfigPaths: true,
  },
  build: {
    chunkSizeWarningLimit: 1500,
    modulePreload: {
      // Keep heavy async chunks out of the entry preload graph; bundle check enforces gzip budgets on what remains.
      resolveDependencies: (_filename, deps) =>
        deps.filter(
          (dep) => !/vendor-(?:maplibre|echarts)|(?:^|\/)(?:MapView|TrendChart)(?:-|\.)/.test(dep),
        ),
    },
    // Vite 8: rolldownOptions replaces the deprecated rollupOptions
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/maplibre-gl/")) return "vendor-maplibre";
          if (id.includes("/node_modules/echarts/")) return "vendor-echarts";
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
