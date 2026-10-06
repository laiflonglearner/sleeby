---
'@sleeby/domain': minor
'@sleeby/copy': minor
---

Measure the last meal and last caffeine in hours before sleep instead of local clock minutes. `NightOutcome` takes an optional `sleepStart`, `CorrelationOptions` takes `mealHoursBeforeSleepLine` and `caffeineHoursBeforeSleepLine`, and `HabitEntry` takes an optional `caffeineFree`. Results report `hoursBeforeSleepLine` and `lineSource` in place of `medianCutoffMinute`. A new pair, `no-caffeine-awakenings`, compares nights with no caffeine to nights with caffeine. The export schema version 1 was edited in place. Copy has new sentences for the hours-before-sleep groups and the dividing line.
