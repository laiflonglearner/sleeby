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

Meal and caffeine are measured in hours before sleep: the elapsed UTC hours from the last meal or caffeine of habit day D to the `sleepStart` of night D. The caller supplies `sleepStart` on the outcome, normally the start of the primary sleep session already chosen for that night; the domain never infers it from logging time. Zero means fewer hours before sleep and one means at or above the dividing line, with ties at the line going to one. Pass `mealHoursBeforeSleepLine` or `caffeineHoursBeforeSleepLine` to choose the line; when absent, the line is the window median of complete days. Results report `hoursBeforeSleepLine` and a `lineSource` of `chosen` or `median`. A night with a missing meal, caffeine time, or sleep start is missing data, never zero hours. A meal or caffeine time after sleep start is rejected as an invalid predictor rather than clamped. Each side must contain at least five days after the split.

The no-caffeine pair compares nights whose habit is marked `caffeineFree` (zero) with nights that have a last caffeine time (one). It has no dividing line. A caffeine-free night that also has a caffeine time is rejected, and a night with neither is missing data. The caffeine hours pair uses only nights with a caffeine time. Point-biserial coefficients are included, with Welch 95% intervals on the group-one-minus-group-zero mean difference. Screen-free minutes versus morning energy uses Pearson and a Fisher z 95% interval after seven pairs. Undefined statistics return machine states instead of NaN. Wide-range presentation defaults use widths greater than two awakenings or one Pearson unit and can be supplied explicitly; these are display policies, not clinical thresholds.

## Exports and compatibility

Streaming JSON and CSV include original records, samples, user data, correlations, primary/suppressed flags, source deletion observations, and user-entry revision links. Supply `tombstone` and `revision` entries alongside every retained snapshot so raw output preserves import and revision history. Revision references must point to supplied entries. The versioned [export JSON schema](schema/export.schema.json) specifies raw and anonymized envelopes. Anonymized mode uses explicit field lists, removes free text, origin/device identifiers and locations, and replaces calendar dates with relative offsets. Anonymized does not mean impossible to identify: a distinctive sleep and habit pattern can be recognized by someone who knows the person's routine or holds other data about them, so treat anonymized output as private health data. Consumers must resolve display copy through `@sleeby/copy`.

The release manifest resolves ESM and declarations from `dist`; workspace development resolves source directly. The archive includes original TypeScript sources so runtime and declaration maps have valid targets, while the exports map keeps consumer entry points explicit. CI installs actual packed artifacts in an isolated consumer and tests runtime imports and strict TypeScript. Breaking exported types or signatures require a major release after 1.0 and a minor release before 1.0. License: MIT.
