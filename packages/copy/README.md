# @sleeby/copy

Prewritten neutral English templates for Sleeby data summaries. Phase 0 templates require owner review before app development; this package has not been published to npm.

```ts
import { resolveCorrelationCopy } from '@sleeby/copy';
import type { CorrelationResult } from '@sleeby/domain';

const result: CorrelationResult = {
  pair: 'screen-energy',
  windowDays: 14,
  startNightKey: '2026-10-01',
  endNightKey: '2026-10-14',
  sampleSize: 0,
  status: 'insufficient-data',
};
const copy = resolveCorrelationCopy(result);
// copy.description: 'Not enough days with both measurements yet for this comparison.'
```

`COPY_TEMPLATES` contains the initial phrase set. `resolveCorrelationCopy` covers insufficient observations, undefined calculations, both binary comparisons, Pearson comparisons, 95% intervals, and wide-range explanations. Binary wording shows each group's average and size, the difference, and the hours-before-sleep mark. `resolveTrendCopy` covers higher, lower, equal, insufficient, and unavailable states for a fixed set of metric labels. No resolver accepts arbitrary caller-written text.

Only numeric substitutions are formatted dynamically. Domain inputs supply machine states, counts, coefficients, and intervals. This package imports domain types only and has no domain runtime import or platform dependency. Templates describe observed values without causes, diagnoses, sleep scores, or recommendations. English is the first reviewed language contract; adding localization requires another deliberate template review.

The ESM release entry and declarations live in `dist`; workspace consumers import source without a build step. CI tests the packed package as an external consumer. Breaking public signatures follow the domain package's versioning policy. License: MIT.
