/** Milliseconds in a real elapsed minute, independent of wall-clock changes. */
export const MILLISECONDS_PER_MINUTE = 60_000;
/** Wall-clock minutes in a calendar day, used only for positions and keys. */
export const MINUTES_PER_DAY = 1_440;
/** The section 6A plotting day starts at 18:00, independently of day keys. */
export const PLOT_ANCHOR_MINUTES = 1_080;
/** Section 6B fallback boundary when no schedule target exists, 04:00. */
export const DEFAULT_DAY_BOUNDARY_MINUTES = 240;
/** Section 3B binary comparisons need five observations in each group. */
export const MINIMUM_BINARY_GROUP_DAYS = 5;
/** Section 3B continuous comparisons need seven complete pairs. */
export const MINIMUM_CONTINUOUS_DAYS = 7;
/** Section 7B candidate duplicates overlap at least half the shorter span. */
export const DUPLICATE_OVERLAP_FRACTION = 0.5;
/** Section 7A fragments from the same origin may have at most a minute gap. */
export const MAXIMUM_STITCH_GAP_MS = MILLISECONDS_PER_MINUTE;
/** Section 7A awakening segments must be strictly longer than this default. */
export const DEFAULT_AWAKENING_THRESHOLD_MS = 3 * MILLISECONDS_PER_MINUTE;
/** Section 7A naps must be strictly longer than this adjustable default. */
export const DEFAULT_NAP_THRESHOLD_MS = 10 * MILLISECONDS_PER_MINUTE;
/** The only pre-registered analysis windows in section 3B. */
export const CORRELATION_WINDOWS = [14, 30] as const;
/** Section 7A typical-bedtime fallback uses the last fourteen primary sessions. */
export const PRIMARY_SESSION_HISTORY_LIMIT = 14;
