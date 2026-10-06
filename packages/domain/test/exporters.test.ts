import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { HEALTH_RECORD_TYPES } from '../src/catalog.js';
import {
  CORRELATION_PAIRS,
  type CorrelationResult,
} from '../src/correlation.js';
import {
  dataExporter,
  exportCsv,
  exportJson,
  type AnonymizedExportOptions,
  type ExportEntry,
  type RecordSelection,
} from '../src/exporters.js';
import type {
  ExerciseCompletionGoal,
  HealthPayloadMap,
  HealthRecordType,
  RawRecord,
  SleepSession,
} from '../src/model.js';
import type { SleepSelection } from '../src/selection.js';

const PRIVATE = 'PRIVATE_identifier_551_東京';
const timestamp = {
  utc: '2026-10-04T00:00:00.000Z',
  reference: { kind: 'offset', offsetSeconds: 25_200 },
} as const;
const keyAssignment = { key: '2026-10-03', boundaryMinutes: 240 };
const metricSample = { timestamp, value: 71 };
const interval = {
  startUtc: timestamp.utc,
  endUtc: '2026-10-04T00:05:00.000Z',
};

const payloads = {
  activeCaloriesBurned: { kilocalories: 5 },
  basalBodyTemperature: { celsius: 36.7, measurementLocation: 8 },
  basalMetabolicRate: { watts: 70 },
  bloodGlucose: {
    millimolesPerLiter: 5,
    specimenSource: 1,
    mealType: 2,
    relationToMeal: 3,
  },
  bloodPressure: {
    systolicMillimetersMercury: 120,
    diastolicMillimetersMercury: 80,
    bodyPosition: 1,
    measurementLocation: 2,
  },
  bodyFat: { percent: 20 },
  bodyTemperature: { celsius: 36, measurementLocation: 1 },
  bodyWaterMass: { kilograms: 50 },
  boneMass: { kilograms: 3 },
  cervicalMucus: { appearance: 2, sensation: 4 },
  cyclingPedalingCadence: { samples: [metricSample] },
  distance: { meters: 100 },
  elevationGained: { meters: 12 },
  exerciseSession: {
    exerciseType: 42,
    title: PRIVATE,
    notes: PRIVATE,
    plannedExerciseSessionId: PRIVATE,
    segments: [{ ...interval, segmentType: 17, repetitions: 12 }],
    laps: [{ ...interval, lengthMeters: 400 }],
    route: {
      status: 'available',
      locations: [{ timestamp, latitude: 21.9876543, longitude: 101.1234567 }],
    },
  },
  floorsClimbed: { floors: 4 },
  heartRate: { samples: [metricSample] },
  heartRateVariabilityRmssd: { milliseconds: 40 },
  height: { meters: 1.7 },
  hydration: { liters: 0.25 },
  intermenstrualBleeding: { present: true },
  leanBodyMass: { kilograms: 55 },
  menstruationFlow: { flow: 2 },
  menstruationPeriod: { present: true },
  mindfulnessSession: {
    mindfulnessSessionType: 3,
    title: PRIVATE,
    notes: PRIVATE,
  },
  nutrition: {
    nutrientsGrams: { protein: 30, caffeine: 0.1, zinc: 0.01 },
    energyKilocalories: 200,
    energyFromFatKilocalories: 30,
    name: PRIVATE,
    mealType: 3,
  },
  ovulationTest: { result: 2 },
  oxygenSaturation: { percent: 98 },
  plannedExerciseSession: {
    hasExplicitTime: true,
    exerciseType: 42,
    title: PRIVATE,
    notes: PRIVATE,
    completedExerciseSessionId: PRIVATE,
    blocks: [
      {
        repetitions: 2,
        description: PRIVATE,
        steps: [
          {
            exerciseType: 17,
            exercisePhase: 3,
            description: PRIVATE,
            completionGoal: {
              kind: 'distance-duration',
              meters: 800,
              milliseconds: 200_000,
            },
            performanceTargets: [
              { kind: 'heart-rate', minimum: 100, maximum: 130 },
              { kind: 'weight', kilograms: 20 },
            ],
          },
        ],
      },
    ],
  },
  power: { samples: [metricSample] },
  respiratoryRate: { breathsPerMinute: 15 },
  restingHeartRate: { beatsPerMinute: 60 },
  sexualActivity: { protectionUsed: 2 },
  skinTemperature: {
    baselineCelsius: 34,
    deltas: [metricSample],
    measurementLocation: 9,
  },
  sleepSession: {
    stages: [{ ...interval, stage: 'LIGHT' }],
    title: PRIVATE,
    notes: PRIVATE,
  },
  speed: { samples: [metricSample] },
  stepsCadence: { samples: [metricSample] },
  steps: { count: 400 },
  totalCaloriesBurned: { kilocalories: 300 },
  vo2Max: { millilitersPerMinuteKilogram: 43, measurementMethod: 2 },
  weight: { kilograms: 70 },
  wheelchairPushes: { count: 25 },
} satisfies HealthPayloadMap;

function record<T extends HealthRecordType>(
  type: T,
  payload: HealthPayloadMap[T],
  suffix: string = type,
): RawRecord<T> {
  return {
    id: `${PRIVATE}:${suffix}`,
    source: 'health-connect',
    origin: PRIVATE,
    device: {
      manufacturer: PRIVATE,
      model: PRIVATE,
      type: 7,
      identifier: PRIVATE,
    },
    recordingMethod: 'automatic',
    externalId: PRIVATE,
    lastModifiedUtc: '2026-10-04T01:00:00.000000001Z',
    start: timestamp,
    end: { ...timestamp, utc: interval.endUtc },
    keyAssignment,
    rawPayload: {
      native: PRIVATE,
      numericNanoseconds: '1791072000000000001',
      freeText: PRIVATE,
      unmodeledFields: [1, 2, 3],
    },
    type,
    payload,
  } as RawRecord<T>;
}

const records = HEALTH_RECORD_TYPES.map((type) => record(type, payloads[type]));
const anonymous: AnonymizedExportOptions = {
  mode: 'anonymized',
  baselineUtc: timestamp.utc,
  baselineDayKey: '2026-10-03',
  chunkCharacters: 128,
};
const schema: unknown = JSON.parse(
  readFileSync(
    new URL('../schema/export.schema.json', import.meta.url),
    'utf8',
  ),
);
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(
  schema as object,
);

interface Envelope {
  readonly schemaVersion: number;
  readonly catalogVersion: number;
  readonly mode: 'raw' | 'anonymized';
  readonly pairDefinitions: unknown;
  readonly entries: {
    readonly kind: string;
    readonly value: Record<string, unknown>;
  }[];
}

async function collect(output: AsyncIterable<string>): Promise<string> {
  let value = '';
  for await (const chunk of output) value += chunk;
  return value;
}

async function envelope(
  entries: readonly ExportEntry[],
  mode: 'raw' | 'anonymized',
): Promise<Envelope> {
  return JSON.parse(
    await collect(exportJson(entries, mode === 'raw' ? { mode } : anonymous)),
  ) as Envelope;
}

function expectSchema(value: unknown): void {
  if (!validate(value)) throw new Error(JSON.stringify(validate.errors));
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (character === '\r' && value[index + 1] === '\n' && !quoted) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else cell += character;
  }
  if (quoted || cell || row.length) throw new Error('invalid-rfc4180-csv');
  return rows;
}

function parsedRows(
  value: string,
): { kind: string; value: Record<string, unknown> }[] {
  const rows = parseCsv(value);
  expect(rows.shift()).toEqual([
    'schema_version',
    'mode',
    'kind',
    'payload_json',
  ]);
  return rows.map((row) => {
    expect(row).toHaveLength(4);
    expect(row[0]).toBe('1');
    expect(row[3]?.startsWith('{')).toBe(true);
    return {
      kind: row[2]!,
      value: JSON.parse(row[3]!) as Record<string, unknown>,
    };
  });
}

describe('complete-store provenance exports', () => {
  const initial = {
    id: `${PRIVATE}:habit-original`,
    timestamp,
    keyAssignment,
    monitoring: 'tracked',
  } as const;
  const revised = {
    ...initial,
    id: `${PRIVATE}:habit-revised`,
    screenFreeMinutes: 45,
  } as const;
  const entries: readonly ExportEntry[] = [
    {
      kind: 'revision',
      value: { entity: 'habit', id: revised.id, supersedesId: initial.id },
    },
    { kind: 'habit', value: revised },
    { kind: 'habit', value: initial },
    {
      kind: 'tombstone',
      value: {
        id: `${PRIVATE}:deletion`,
        source: 'health-connect',
        origin: PRIVATE,
        externalId: PRIVATE,
        observedAtUtc: '2026-10-04T00:00:00.000000001Z',
      },
    },
  ];

  it('preserves append-only revision edges and source deletions in raw JSON and CSV', async () => {
    const output = await envelope(entries, 'raw');
    expectSchema(output);
    expect(output.entries).toEqual(entries);
    const rows = parsedRows(await collect(exportCsv(entries, { mode: 'raw' })));
    expect(rows.slice(1)).toEqual(entries);
  });

  it('retains anonymous revision topology while removing deletion identifiers and dates', async () => {
    const output = await envelope(entries, 'anonymized');
    expectSchema(output);
    const text = JSON.stringify(output);
    expect(text).not.toContain(PRIVATE);
    expect(text).not.toContain('2026-');
    expect(output.entries[0]!.value['ordinal']).toBe(
      output.entries[1]!.value['ordinal'],
    );
    expect(output.entries[0]!.value['supersedesOrdinal']).toBe(
      output.entries[2]!.value['ordinal'],
    );
    expect(output.entries[3]!.value['observedElapsedMilliseconds']).toBe(
      0.000001,
    );
    const rows = parsedRows(await collect(exportCsv(entries, anonymous)));
    expect(rows.slice(1)).toEqual(output.entries);
    output.entries[3]!.value['externalId'] = PRIVATE;
    expect(validate(output)).toBe(false);
  });

  it('rejects lineage with a missing predecessor in both formats and modes', async () => {
    const incomplete = entries.filter(
      (entry) => entry.kind !== 'habit' || entry.value.id !== initial.id,
    );
    for (const options of [{ mode: 'raw' } as const, anonymous]) {
      await expect(collect(exportJson(incomplete, options))).rejects.toThrow(
        'incomplete-export-reference',
      );
      await expect(collect(exportCsv(incomplete, options))).rejects.toThrow(
        'incomplete-export-reference',
      );
    }
  });
});

describe('versioned export schemas and complete catalog coverage', () => {
  const completionGoals = {
    distance: { kind: 'distance', meters: 800 },
    'distance-duration': {
      kind: 'distance-duration',
      meters: 800,
      milliseconds: 200_000,
    },
    duration: { kind: 'duration', milliseconds: 200_000 },
    steps: { kind: 'steps', count: 400 },
    repetitions: { kind: 'repetitions', count: 12 },
    'total-calories': { kind: 'total-calories', kilocalories: 200 },
    'active-calories': { kind: 'active-calories', kilocalories: 150 },
    unknown: { kind: 'unknown' },
    'manual-completion': { kind: 'manual-completion' },
  } satisfies {
    [Kind in ExerciseCompletionGoal['kind']]: ExerciseCompletionGoal & {
      kind: Kind;
    };
  };

  for (const mode of ['raw', 'anonymized'] as const) {
    it.each(Object.values(completionGoals))(
      `round-trips the $kind completion goal through schema-validated ${mode} JSON and CSV`,
      async (completionGoal) => {
        const value = record('plannedExerciseSession', {
          hasExplicitTime: true,
          exerciseType: 42,
          blocks: [
            {
              repetitions: 2,
              steps: [
                {
                  exerciseType: 17,
                  exercisePhase: 3,
                  completionGoal,
                  performanceTargets: [],
                },
              ],
            },
          ],
        });
        const entries: readonly ExportEntry[] = [{ kind: 'record', value }];
        const output = await envelope(entries, mode);
        expectSchema(output);
        expect(output.entries[0]!.value['payload']).toEqual(value.payload);

        const options = mode === 'raw' ? { mode } : anonymous;
        const rows = parsedRows(await collect(exportCsv(entries, options)));
        const csvRecord = rows.find((row) => row.kind === 'record')!;
        const { rawPayloadEncoding, ...restored } = csvRecord.value;
        if (mode === 'raw') {
          expect(rawPayloadEncoding).toBe('json-fragments');
          restored['rawPayload'] = JSON.parse(
            rows
              .filter((row) => row.kind === 'raw-payload')
              .map((row) => row.value['fragment'])
              .join(''),
          ) as unknown;
        }
        const reconstructed = { kind: 'record', value: restored };
        expect(reconstructed).toEqual(output.entries[0]);
        expectSchema({ ...output, entries: [reconstructed] });
      },
    );
  }

  it('preserves every cataloged raw record verbatim, including native fields and free text', async () => {
    const entries = records.map((value): ExportEntry => ({
      kind: 'record',
      value,
    }));
    const output = await envelope(entries, 'raw');
    expectSchema(output);
    expect(output.entries).toEqual(entries);
    expect(output.pairDefinitions).toEqual(CORRELATION_PAIRS);
    expect(output.entries).toHaveLength(41);
  });

  it('validates every anonymous catalog projection and strips sensitive strings and routes', async () => {
    const output = await envelope(
      records.map((value) => ({ kind: 'record', value })),
      'anonymized',
    );
    expectSchema(output);
    const text = JSON.stringify(output);
    expect(text).not.toContain(PRIVATE);
    expect(text).not.toContain('2026-');
    expect(text).not.toContain('25_200');
    for (const field of [
      'rawPayload',
      'device',
      'origin',
      'externalId',
      'lastModifiedUtc',
      'notes',
      'title',
      'name',
      'description',
      'route',
      'latitude',
      'longitude',
      'plannedExerciseSessionId',
      'completedExerciseSessionId',
      'numericNanoseconds',
    ])
      expect(text).not.toContain(`"${field}"`);
    expect(output.entries.map((entry) => entry.value['type'])).toEqual(
      HEALTH_RECORD_TYPES,
    );
    expect(
      output.entries.find((entry) => entry.value['type'] === 'nutrition')
        ?.value['payload'],
    ).toEqual({
      energyKilocalories: 200,
      energyFromFatKilocalories: 30,
      mealType: 3,
      nutrientsGrams: { caffeine: 0.1, protein: 30, zinc: 0.01 },
    });
    expect(
      output.entries.find((entry) => entry.value['type'] === 'bloodGlucose')
        ?.value['payload'],
    ).toEqual(payloads.bloodGlucose);
  });

  it('rejects anonymous schema drift and unexpected identifiers', async () => {
    const output = await envelope(
      [{ kind: 'record', value: records[0]! }],
      'anonymized',
    );
    output.entries[0]!.value['origin'] = PRIVATE;
    expect(validate(output)).toBe(false);
    delete output.entries[0]!.value['origin'];
    (output.entries[0]!.value['payload'] as Record<string, unknown>)['notes'] =
      PRIVATE;
    expect(validate(output)).toBe(false);
  });

  it('rejects missing required scalar payload fields in the committed schema', async () => {
    const output = await envelope(
      [{ kind: 'record', value: record('steps', payloads.steps) }],
      'raw',
    );
    delete (output.entries[0]!.value['payload'] as Record<string, unknown>)[
      'count'
    ];
    expect(validate(output)).toBe(false);
  });
});

describe('calendar offsets, references and correlation exports', () => {
  const first = record('sleepSession', payloads.sleepSession, 'first');
  const second = record('sleepSession', payloads.sleepSession, 'second');
  const session = (value: typeof first): SleepSession => ({
    id: value.id,
    origin: value.origin,
    start: value.start,
    end: value.end,
    records: [value],
    stages: value.payload.stages,
  });
  const selections: readonly SleepSelection[] = [
    {
      session: session(first),
      status: 'primary',
      supersededBy: null,
      reason: 'information-richness',
    },
    {
      session: session(second),
      status: 'suppressed',
      supersededBy: first.id,
      reason: 'duplicate',
    },
  ];
  const denseFirst = record(
    'heartRate',
    { samples: [metricSample, { ...metricSample, value: 73 }] },
    'dense-first',
  );
  const denseSecond = record(
    'heartRate',
    { samples: [metricSample] },
    'dense-second',
  );
  const dense: RecordSelection = {
    target: {
      recordId: denseSecond.id,
      sampleField: 'samples',
      sampleIndex: 0,
    },
    window: interval,
    status: 'suppressed',
    supersededBy: {
      recordId: denseFirst.id,
      sampleField: 'samples',
      sampleIndex: 1,
    },
    reason: 'density',
  };
  const correlation: CorrelationResult = {
    pair: 'meal-awakenings',
    windowDays: 14,
    startNightKey: '2026-09-21',
    endNightKey: '2026-10-04',
    sampleSize: 10,
    groupSizes: [5, 5],
    hoursBeforeSleepLine: 3.5,
    lineSource: 'chosen',
    status: 'computed',
    method: 'point-biserial',
    coefficient: 0.5,
    difference: 1,
    groupMeans: [1, 2],
    confidenceInterval: { lower: -1, upper: 3, confidenceLevel: 0.95 },
    intervalWide: true,
  };
  const entries: readonly ExportEntry[] = [
    {
      kind: 'night',
      value: {
        id: PRIVATE,
        keyAssignment,
        primarySessionId: first.id,
        sessionIds: [first.id, second.id],
      },
    },
    { kind: 'selection', value: selections[1]! },
    { kind: 'selection', value: selections[0]! },
    { kind: 'record', value: first },
    { kind: 'record', value: second },
    { kind: 'record', value: denseFirst },
    { kind: 'record', value: denseSecond },
    { kind: 'record-selection', value: dense },
    {
      kind: 'habit',
      value: {
        id: PRIVATE,
        timestamp,
        keyAssignment,
        monitoring: 'tracked',
        lastMeal: timestamp,
        lastCaffeine: timestamp,
        caffeineFree: false,
        screenFreeMinutes: 90,
        notes: PRIVATE,
      },
    },
    {
      kind: 'report',
      value: {
        id: PRIVATE,
        timestamp,
        nightAssignment: keyAssignment,
        awakeningCount: 2,
        morningEnergy: 4,
        mood: 3,
        restfulness: 4,
        notes: PRIVATE,
      },
    },
    { kind: 'correlation', value: correlation },
  ];

  it('preserves primary/suppressed flags and all entry kinds in raw JSON', async () => {
    const output = await envelope(entries, 'raw');
    expectSchema(output);
    expect(output.entries).toEqual(entries);
  });

  it('rewires forward references with shared ordinals and preserves statistical estimates', async () => {
    const output = await envelope(entries, 'anonymized');
    expectSchema(output);
    expect(JSON.stringify(output)).not.toContain(PRIVATE);
    const night = output.entries[0]!.value;
    const suppressed = output.entries[1]!.value;
    const primary = output.entries[2]!.value;
    expect(night['primarySessionOrdinal']).toBe(primary['ordinal']);
    expect(suppressed['supersededByOrdinal']).toBe(primary['ordinal']);
    expect(primary['recordOrdinals']).toEqual([
      output.entries[3]!.value['ordinal'],
    ]);
    expect(suppressed['recordOrdinals']).toEqual([
      output.entries[4]!.value['ordinal'],
    ]);
    const comparison = output.entries.at(-1)!.value;
    expect(comparison['coefficient']).toBe(0.5);
    expect(comparison['confidenceInterval']).toEqual(
      correlation.confidenceInterval,
    );
    expect(comparison['startNightDayOffset']).toBe(-12);
    expect(comparison['endNightDayOffset']).toBe(1);
  });

  it('rejects incomplete anonymous reference graphs', async () => {
    await expect(collect(exportJson([entries[0]!], anonymous))).rejects.toThrow(
      'incomplete-export-reference',
    );
    await expect(collect(exportCsv([entries[0]!], anonymous))).rejects.toThrow(
      'incomplete-export-reference',
    );
  });

  it('rejects an out-of-range selected sample and duplicate anonymous identifiers', async () => {
    const invalid: ExportEntry = {
      kind: 'record-selection',
      value: {
        ...dense,
        target: {
          recordId: denseSecond.id,
          sampleField: 'samples',
          sampleIndex: 9,
        },
      },
    };
    await expect(
      collect(
        exportJson(
          [
            ...entries.filter((entry) => entry.kind !== 'record-selection'),
            invalid,
          ],
          anonymous,
        ),
      ),
    ).rejects.toThrow('invalid-export-sample-reference');
    await expect(
      collect(
        exportJson(
          [
            { kind: 'record', value: first },
            { kind: 'record', value: first },
          ],
          anonymous,
        ),
      ),
    ).rejects.toThrow('duplicate-export-identifier');
    await expect(
      collect(exportCsv([entries[0]!], { mode: 'raw' })),
    ).rejects.toThrow('incomplete-export-reference');
  });

  it('keeps sub-millisecond differences by subtracting UTC instants before numeric conversion', async () => {
    const value = {
      ...record('steps', payloads.steps),
      start: { utc: '2026-10-04T00:00:00.000000001Z', reference: null },
      end: { utc: '2026-10-04T00:00:00.000000002Z', reference: null },
      keyAssignment: null,
    };
    const output = await envelope([{ kind: 'record', value }], 'anonymized');
    expectSchema(output);
    expect(output.entries[0]!.value['start']).toEqual({
      elapsedMilliseconds: 0.000001,
      localPlotMinutes: null,
    });
    expect(output.entries[0]!.value['end']).toEqual({
      elapsedMilliseconds: 0.000002,
      localPlotMinutes: null,
    });
  });

  it('preserves nine real UTC hours across fall-back without using plotting positions', async () => {
    const value = {
      ...record('sleepSession', { stages: [] }),
      start: {
        utc: '2024-11-03T02:00:00Z',
        reference: { kind: 'iana', zone: 'America/New_York' } as const,
      },
      end: {
        utc: '2024-11-03T11:00:00Z',
        reference: { kind: 'iana', zone: 'America/New_York' } as const,
      },
      keyAssignment: { key: '2024-11-02', boundaryMinutes: 240 },
    };
    const output = JSON.parse(
      await collect(
        exportJson([{ kind: 'record', value }], {
          mode: 'anonymized',
          baselineUtc: '2024-11-03T02:00:00Z',
          baselineDayKey: '2024-11-02',
        }),
      ),
    ) as Envelope;
    expectSchema(output);
    expect(output.entries[0]!.value['start']).toEqual({
      elapsedMilliseconds: 0,
      localPlotMinutes: 240,
    });
    expect(output.entries[0]!.value['end']).toEqual({
      elapsedMilliseconds: 9 * 60 * 60 * 1000,
      localPlotMinutes: 720,
    });
    expect(output.entries[0]!.value['keyAssignment']).toEqual({
      dayOffset: 0,
      boundaryMinutes: 240,
    });
  });

  it('round-trips raw CSV native fragments, individual samples, notes, and flags', async () => {
    const source: readonly ExportEntry[] = [
      ...entries,
      ...records
        .filter((value) => value.type !== 'sleepSession')
        .map((value): ExportEntry => ({ kind: 'record', value })),
    ];
    const rows = parsedRows(
      await collect(exportCsv(source, { mode: 'raw', chunkCharacters: 64 })),
    );
    expect(rows[0]!.value['pairDefinitions']).toEqual(CORRELATION_PAIRS);
    const restored = new Map<string, Record<string, unknown>>();
    for (const row of rows.filter((item) => item.kind === 'record')) {
      const { rawPayloadEncoding, sampleField, sampleCount, ...value } =
        row.value;
      expect(rawPayloadEncoding).toBe('json-fragments');
      const id = value['id'] as string;
      const fragments = rows
        .filter(
          (item) =>
            item.kind === 'raw-payload' && item.value['recordId'] === id,
        )
        .sort((a, b) => Number(a.value['index']) - Number(b.value['index']));
      expect(
        fragments.every(
          (fragment) => String(fragment.value['fragment']).length <= 64,
        ),
      ).toBe(true);
      value['rawPayload'] = JSON.parse(
        fragments.map((fragment) => fragment.value['fragment']).join(''),
      ) as unknown;
      if (sampleField !== undefined) {
        const samples = rows
          .filter(
            (item) => item.kind === 'sample' && item.value['recordId'] === id,
          )
          .sort((a, b) => Number(a.value['index']) - Number(b.value['index']));
        expect(samples).toHaveLength(Number(sampleCount));
        (value['payload'] as Record<string, unknown>)[String(sampleField)] =
          samples.map((item) => item.value['value']);
      }
      restored.set(id, value);
    }
    const reconstructed = rows
      .filter(
        (row) => !['manifest', 'raw-payload', 'sample'].includes(row.kind),
      )
      .map((row) => {
        if (row.kind === 'record')
          return {
            kind: row.kind,
            value: restored.get(String(row.value['id'])),
          };
        if (row.kind === 'selection') {
          const { recordIds, ...sessionValue } = row.value['session'] as Record<
            string,
            unknown
          >;
          return {
            kind: row.kind,
            value: {
              ...row.value,
              session: {
                ...sessionValue,
                records: (recordIds as string[]).map((id) => restored.get(id)),
              },
            },
          };
        }
        return row;
      });
    expect(reconstructed).toEqual(source);
  });

  it('reconstructs anonymous CSV to the same schema-validated JSON envelope', async () => {
    const source: readonly ExportEntry[] = [
      ...entries,
      { kind: 'record', value: record('heartRate', payloads.heartRate) },
    ];
    const expected = await envelope(source, 'anonymized');
    const rows = parsedRows(await collect(exportCsv(source, anonymous)));
    const reconstructed = rows
      .filter((row) => !['manifest', 'sample'].includes(row.kind))
      .map((row) => {
        if (row.kind !== 'record') return row;
        const { sampleField, sampleCount, ...value } = row.value;
        if (sampleField !== undefined) {
          const samples = rows.filter(
            (sampleRow) =>
              sampleRow.kind === 'sample' &&
              sampleRow.value['recordOrdinal'] === value['ordinal'],
          );
          expect(samples).toHaveLength(Number(sampleCount));
          (value['payload'] as Record<string, unknown>)[String(sampleField)] =
            samples.map((sampleRow) => sampleRow.value['value']);
        }
        return { kind: row.kind, value };
      });
    expect(reconstructed).toEqual(expected.entries);
    expectSchema({ ...expected, entries: reconstructed });
  });
});

describe('streaming, immutability and hostile text', () => {
  it('preserves a computed binary coefficient with an unavailable Welch state in every export mode', async () => {
    const result: CorrelationResult = {
      pair: 'meal-awakenings',
      windowDays: 14,
      startNightKey: '2026-09-21',
      endNightKey: '2026-10-04',
      sampleSize: 10,
      groupSizes: [5, 5],
      hoursBeforeSleepLine: 3.5,
      lineSource: 'chosen',
      status: 'unavailable',
      reason: 'constant-variable',
      method: 'point-biserial',
      coefficient: 1,
    };
    const entries: readonly ExportEntry[] = [
      { kind: 'correlation', value: result },
    ];
    for (const mode of ['raw', 'anonymized'] as const) {
      const output = await envelope(entries, mode);
      expectSchema(output);
      expect(output.entries[0]!.value).toMatchObject({
        status: 'unavailable',
        reason: 'constant-variable',
        method: 'point-biserial',
        coefficient: 1,
      });
      expect(output.entries[0]!.value).not.toHaveProperty('confidenceInterval');
      const rows = parsedRows(
        await collect(
          exportCsv(entries, mode === 'raw' ? { mode } : anonymous),
        ),
      );
      expect(
        rows.find((row) => row.kind === 'correlation')!.value,
      ).toMatchObject({
        status: 'unavailable',
        reason: 'constant-variable',
        method: 'point-biserial',
        coefficient: 1,
      });
    }
  });

  it.each([64, 65, 128])(
    'preserves Unicode through independently UTF-8 encoded JSON chunks bounded by %i characters',
    async (chunkCharacters) => {
      for (let padding = 0; padding < chunkCharacters; padding += 1) {
        const text = `${'a'.repeat(padding)}\u{1f600}\u{1f680}\u{10437}`;
        const value = {
          ...record('sleepSession', { stages: [], notes: text }),
          id: text,
          rawPayload: { [text]: text, loneSurrogate: '\ud800' },
        };
        const encoded: Uint8Array[] = [];
        const encoder = new TextEncoder();
        for await (const chunk of exportJson([{ kind: 'record', value }], {
          mode: 'raw',
          chunkCharacters,
        })) {
          expect(chunk.length).toBeGreaterThan(0);
          expect(chunk.length).toBeLessThanOrEqual(chunkCharacters);
          encoded.push(encoder.encode(chunk));
        }
        const restored = JSON.parse(
          Buffer.concat(encoded).toString('utf8'),
        ) as Envelope;
        expectSchema(restored);
        expect(restored.entries[0]!.value).toEqual(value);
      }
    },
  );

  it('does not advance the caller cursor until requested by the consumer', async () => {
    let reads = 0;
    async function* source(): AsyncGenerator<ExportEntry> {
      for (const value of records) {
        reads += 1;
        yield { kind: 'record', value };
      }
    }
    const iterator = exportJson(source(), { mode: 'raw' });
    await iterator.next();
    expect(reads).toBe(0);
    await iterator.next();
    expect(reads).toBe(1);
    await iterator.return(undefined);
    expect(reads).toBe(1);
  });

  it('emits dense samples individually without altering frozen caller records', async () => {
    const samples = Object.freeze(
      Array.from({ length: 500 }, (_, value) =>
        Object.freeze({ timestamp, value }),
      ),
    );
    const value = Object.freeze(
      record('heartRate', Object.freeze({ samples })),
    );
    const rows = parsedRows(
      await collect(dataExporter.csv([{ kind: 'record', value }], anonymous)),
    );
    expect(rows.filter((row) => row.kind === 'sample')).toHaveLength(500);
    expect(samples[499]!.value).toBe(499);
    const json = JSON.parse(
      await collect(dataExporter.json([{ kind: 'record', value }], anonymous)),
    ) as Envelope;
    expectSchema(json);
    expect(
      (json.entries[0]!.value['payload'] as { samples: unknown[] }).samples,
    ).toHaveLength(500);
  });

  it('projects anonymous sample arrays lazily instead of allocating a whole-history copy', async () => {
    let projected = 0;
    const samples = Array.from({ length: 10_000 }, (_, value) => ({
      timestamp,
      get value(): number {
        projected += 1;
        return value;
      },
    }));
    const iterator = exportJson(
      [{ kind: 'record', value: record('heartRate', { samples }) }],
      { ...anonymous, chunkCharacters: 256 },
    );
    while (projected === 0) expect((await iterator.next()).done).toBe(false);
    expect(projected).toBeLessThan(samples.length);
    await iterator.return(undefined);
  });

  it('keeps spreadsheet formulas inside object cells and round-trips quotes, commas, and line breaks', async () => {
    const notes =
      '=HYPERLINK("https://example.test","private"),\r\n+1\n@SUM(1)\t東京';
    const value = {
      ...record('sleepSession', { stages: [], notes }),
      id: '=FORMULA(1)',
      origin: '@FORMULA',
      externalId: '+SUM(1)',
    };
    const rows = parsedRows(
      await collect(exportCsv([{ kind: 'record', value }], { mode: 'raw' })),
    );
    expect(rows.find((row) => row.kind === 'record')?.value['id']).toBe(
      value.id,
    );
    expect(
      (
        rows.find((row) => row.kind === 'record')?.value['payload'] as {
          notes: string;
        }
      ).notes,
    ).toBe(notes);
  });

  it('rejects invalid configuration and non-finite values instead of serializing null', async () => {
    await expect(
      collect(exportJson([], { mode: 'raw', chunkCharacters: 1 })),
    ).rejects.toThrow('invalid-export-chunk-size');
    const invalid = record('steps', { count: NaN });
    await expect(
      collect(
        exportJson([{ kind: 'record', value: invalid }], { mode: 'raw' }),
      ),
    ).rejects.toThrow('non-finite-export-value');
    await expect(
      collect(exportCsv([{ kind: 'record', value: invalid }], { mode: 'raw' })),
    ).rejects.toThrow('non-finite-export-value');
  });

  it('drops unknown native and nested string fields instead of recursively preserving them', async () => {
    const value = {
      ...record('nutrition', payloads.nutrition),
      payload: {
        ...payloads.nutrition,
        secretlyNamed: PRIVATE,
        nutrientsGrams: { ...payloads.nutrition.nutrientsGrams, [PRIVATE]: 2 },
      },
      rawPayload: { deeply: { nested: PRIVATE } },
    };
    const output = await envelope([{ kind: 'record', value }], 'anonymized');
    expectSchema(output);
    expect(JSON.stringify(output)).not.toContain(PRIVATE);
    expect(
      (output.entries[0]!.value['payload'] as { nutrientsGrams: unknown })
        .nutrientsGrams,
    ).toEqual(payloads.nutrition.nutrientsGrams);
  });

  it('rejects hidden free text in fields that are declared numeric', async () => {
    const value = record('heartRate', {
      samples: [{ timestamp, value: PRIVATE as unknown as number }],
    });
    await expect(
      collect(exportJson([{ kind: 'record', value }], anonymous)),
    ).rejects.toThrow('invalid-anonymized-number');
    const plan = record('plannedExerciseSession', {
      ...payloads.plannedExerciseSession,
      blocks: [
        {
          ...payloads.plannedExerciseSession.blocks[0]!,
          repetitions: PRIVATE as unknown as number,
        },
      ],
    });
    await expect(
      collect(exportJson([{ kind: 'record', value: plan }], anonymous)),
    ).rejects.toThrow('invalid-anonymized-number');
  });
});
