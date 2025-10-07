# consentify

[![npm version](https://img.shields.io/npm/v/@consentify/core.svg)](https://www.npmjs.com/package/@consentify/core)
[![npm downloads](https://img.shields.io/npm/dm/@consentify/core.svg)](https://www.npmjs.com/package/@consentify/core)
[![license](https://img.shields.io/npm/l/@consentify/core.svg)](https://github.com/RomanDenysov/consentify/blob/main/packages/core/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)

Minimal, headless cookie consent management for modern web applications.

### Packages

- **[@consentify/core](./packages/core)** — Headless cookie consent SDK (TypeScript-first, SSR-safe, zero dependencies)
- Future: `@consentify/react`, `@consentify/next`

### Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Build core only
pnpm -w --filter @consentify/core build
```

### Publishing

CI publishes on tags matching `core-v*`. Ensure `NPM_TOKEN` is set in GitHub secrets.

```bash
# Create a new version with changeset
pnpm changeset

# Version packages
pnpm changeset version

# Publish (via CI or manually)
git tag core-v0.1.0
git push origin core-v0.1.0
```

### Support

If you find this project useful, consider supporting its development:

- ⭐ [GitHub Sponsors](https://github.com/sponsors/RomanDenysov)
- ☕ [Ko-fi](https://ko-fi.com/romandenysov)

### License

MIT © 2025 [Roman Denysov](https://github.com/RomanDenysov)
