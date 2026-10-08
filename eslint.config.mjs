import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Lime ships its own lint for these: lime.eslint.config.mjs.
    "components/lime/**",
    "lib/lime/**",
    "lime.eslint.config.mjs",
    // Third-party component from the componentry registry.
    "components/ui/**",
  ]),
]);

export default eslintConfig;
