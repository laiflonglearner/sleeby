# @sleeby/domain

Framework-free habit and sleep data contracts. There are no sleep scores, medical recommendations, React imports, storage clients, or runtime dependencies. Phase 0 is prerelease work; this package has not been published to npm.

## Public API

The package exports immutable records for all 41 concrete Health Connect SDK 1.1.0 types, metadata and timestamp references, the `HealthSource` interface for importing data, habit/night/report types, stored key assignments, source selection and derived metrics, the three registered correlation pairs, display-only LTTB downsampling, and streaming data exporters. Every exported declaration includes TSDoc. `HealthSource` adapters implement native permissions and bounded I/O in apps, never in this package.

```ts
import {
  normalizeTimestamp,
  assignNightKey,
  durationMinutes,
} from '@sleeby/domain';

const start = normalizeTimestamp('2026-10-04T01:00:00+07:00', {
  kind: 'offset',
  offsetSeconds: 25_200,
});
const assignment = assignNightKey(start, 240);
// assignment.key is '2026-10-03'. Persist both the key and boundary.
const minutes = durationMinutes(
  '2026-03-08T00:00:00-05:00',
  '2026-03-08T08:00:00-04:00',
);
// minutes is 420, despite an eight-hour wall-clock span.
```

`normalizeTimestamp` supports explicit-offset ISO instants with up to nine fractional digits and preserves that precision in UTC. Elapsed calculations and interval comparisons use exact UTC instants before converting the result to a numeric duration. Plotting positions use local minutes only. Manual references use an IANA zone; native start and end offsets may differ, and missing references stay null. A missing native reference needs an explicit caller decision before keys or local chart positions can be assigned.

## Source selection and metrics

`selectSleepRecords` first reconstructs same-origin fragments separated by at most one minute. Cross-origin candidates overlap at least half the shorter span. Connected candidate groups choose primary data by distinct stage types, segment count, other-metric evidence, recording method, earliest modification time, then stable ID. Explicit overrides take precedence. Outputs retain every raw fragment and suppression reference. Dense samples use unique-timestamp density within an explicit metric window; additive metrics select one origin by clipped union coverage per declared day and never sum across origins.

`deriveSleepMetrics` and `totalSleepMilliseconds` union asleep intervals. Awake and unknown stages never become asleep time. `detectNaps` retains the full span of the primary logical session so awakenings do not turn its later sleep segments into naps. Its caller supplies a resolved UTC bedtime anchor, a target or historical bedtime reference, and may override the primary session. This classification is a reversible rule of thumb, not a diagnosis.

## Correlations

Call `analyzeCorrelations(habits, outcomes, { windowDays: 14, endNightKey: '2026-10-14' })` with one final daily snapshot and one explicitly keyed outcome per night. Only 14-day and 30-day windows exist. Duplicate keys are rejected. Rest, unmonitored, and incomplete days are excluded; missing caffeine is not treated as zero exposure.

Meal and caffeine binary values are local cutoff minutes unwrapped at the habit's stored boundary, split at the active window's complete-pair median. Zero is below the median and one is at or above it. Median ties remain together. Each side must contain at least five days. Point-biserial coefficients are included, with Welch 95% intervals on the group-one-minus-group-zero mean difference. Screen-free minutes versus morning energy uses Pearson and a Fisher z 95% interval after seven pairs. Undefined statistics return machine states instead of NaN. Wide-range presentation defaults use widths greater than two awakenings or one Pearson unit and can be supplied explicitly; these are display policies, not clinical thresholds.

## Exports and compatibility

Streaming JSON and CSV include original records, samples, user data, correlations, primary/suppressed flags, source deletion observations, and user-entry revision links. Supply `tombstone` and `revision` entries alongside every retained snapshot so raw output preserves import and revision history. Revision references must point to supplied entries. The versioned [export JSON schema](schema/export.schema.json) specifies raw and anonymized envelopes. Anonymized mode uses explicit field lists, removes free text, origin/device identifiers and locations, and replaces calendar dates with relative offsets. Remaining health data may still identify a person. Consumers must resolve display copy through `@sleeby/copy`.

The release manifest resolves ESM and declarations from `dist`; workspace development resolves source directly. The archive includes original TypeScript sources so runtime and declaration maps have valid targets, while the exports map keeps consumer entry points explicit. CI installs actual packed artifacts in an isolated consumer and tests runtime imports and strict TypeScript. Breaking exported types or signatures require a major release after 1.0 and a minor release before 1.0. License: MIT.
