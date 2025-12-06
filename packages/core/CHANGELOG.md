# @consentify/core

## 1.0.0

### Major Changes

- 82d0599: Initial release of @consentify/core - a minimal headless cookie consent SDK with TypeScript-first API, SSR support, and zero dependencies.

  Features:

  - Headless architecture with full control over UI
  - TypeScript-first with strong type safety
  - SSR-safe implementation (server and client APIs)
  - Zero runtime dependencies
  - Compact cookie-based storage with optional localStorage mirror
  - Policy versioning with automatic snapshot invalidation
  - GDPR and CCPA compliance ready
  - Default and custom consent categories support

### Minor Changes

- Add React integration support with subscribe() and getServerSnapshot() for useSyncExternalStore

## [Unreleased]

### Added

- **React integration support**: New `subscribe()` and `getServerSnapshot()` methods on the client API for seamless `useSyncExternalStore` integration
- Internal state caching for optimal React performance — state is cached and updated only on changes
- Subscriber notification system — listeners are notified when consent state changes via `set()` or `clear()`

### Changed

- `client.get()` now returns cached state instead of re-reading storage on every call, improving React render performance

## 0.1.0

### Initial Release

**Features:**

- Headless cookie consent SDK with zero dependencies
- Full TypeScript support with strong typing
- SSR-safe implementation (server and client APIs)
- Compact cookie-based storage
- Optional localStorage mirror for fast client reads
- Policy versioning with automatic invalidation
- Support for custom consent categories
- Deterministic policy hashing
- GDPR and CCPA compliance ready

**API:**

- `createConsentify()` - Main factory function
- Server API: `get()`, `set()`, `clear()`
- Client API: `get()`, `set()`, `clear()`
- Default categories: preferences, analytics, marketing, functional, unclassified

**Documentation:**

- Complete API reference
- SSR usage examples
- TypeScript examples
- Custom categories guide
