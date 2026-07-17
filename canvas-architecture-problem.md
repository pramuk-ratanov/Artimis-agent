# The Artimis Canvas Architecture Problem

## The Symptom
The Canvas frequently broke, showed a blank white screen, or failed to render when the agent generated complex UI components. Every time we fixed one issue, another dependency/import/runtime issue appeared.

## The Root Cause: Naive Execution Environment
The old Canvas architecture was a fake React environment. It used a static HTML iframe that injected Babel in the browser and evaluated generated code on the fly.

It was not a real Node.js, Webpack, Vite, or package-managed environment.

Because there was no bundler and no package manager, it could not reliably handle standard modern React code.

## The Dependency Trap
Language models are trained on standard modern React repositories. When asked to build a UI, they naturally write code like:

```tsx
import { motion } from 'framer-motion';
import { Truck } from 'lucide-react';
import { Card } from '@/components/ui/card';
```

The old Canvas could not resolve those imports. Regex-stripping imports and mapping globals from CDNs was brittle and caused repeated failures.

## Implemented Direction: Sandpack
The Canvas has been migrated toward `@codesandbox/sandpack-react`, which gives the preview a real client-side bundling/runtime layer instead of Babel plus eval.

Benefits:
- Removes direct eval of model-generated React code.
- Supports standard React/TypeScript patterns better than the old iframe shell.
- Provides a proper preview/code split.
- Makes package/runtime limitations explicit instead of hiding them behind regex hacks.

## Current Tradeoff
By default, Sandpack uses CodeSandbox's hosted bundler/preview infrastructure. That means generated Canvas code may leave the local machine unless a self-hosted bundler is configured.

For private/self-hosted operation, set:

```env
VITE_SANDPACK_BUNDLER_URL=<self-hosted-sandpack-bundler-url>
```

## Security Note
The `/api/config` endpoint manages provider API keys and model routing.

Browser-origin protection and explicit CORS allowlists are now in place, but for any networked deployment where other machines can reach the Artimis port, set:

```env
ARTIMIS_API_KEY=<strong-random-key>
ARTIMIS_ALLOWED_ORIGINS=http://100.95.117.9:7002,http://localhost:7002
```

Without `ARTIMIS_API_KEY`, non-browser clients that can reach the port can still call API routes directly.

## Future Hardening
If Canvas previews must be fully private and offline-capable, the next step is self-hosting the Sandpack bundler or moving to a stronger local sandbox/WebContainer architecture.
