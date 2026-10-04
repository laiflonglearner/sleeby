import { describe, expect, it } from 'vitest';
import {
  HEALTH_CATALOG,
  HEALTH_CONNECT_SDK_VERSION,
  HEALTH_RECORD_TYPES,
} from '../src/catalog.js';
import fixture from './fixtures/health-connect-1.1.0.json' with { type: 'json' };

describe('stable Health Connect catalog', () => {
  it('matches every concrete Record from the official 1.1.0 source artifact', () => {
    expect(HEALTH_CONNECT_SDK_VERSION).toBe(fixture.sdkVersion);
    expect(
      Object.values(HEALTH_CATALOG)
        .map((entry) => entry.platformRecord)
        .sort(),
    ).toEqual(fixture.concreteRecords);
    expect(HEALTH_RECORD_TYPES).toHaveLength(41);
  });

  it('gives every approved type a concrete raw view, canonical units and versioned export mapping', () => {
    for (const type of HEALTH_RECORD_TYPES) {
      const entry = HEALTH_CATALOG[type];
      expect(entry.rawView.length).toBeGreaterThan(0);
      expect(entry.units.length).toBeGreaterThan(0);
      expect(entry.exportMapping).toEqual({
        version: 1,
        jsonPath: 'payload',
        csvPayloadColumn: 'payload_json',
        csvSampleRowKind: 'sample',
        format: 'sleeby-long-form-v1',
      });
      expect(Object.isFrozen(entry)).toBe(true);
    }
    expect(HEALTH_CATALOG.skinTemperature.feature).toBe('skin-temperature');
    expect(HEALTH_CATALOG.mindfulnessSession.feature).toBe('mindfulness');
    expect(HEALTH_CATALOG.plannedExerciseSession.feature).toBe(
      'planned-exercise',
    );
    expect(HEALTH_RECORD_TYPES).not.toContain('activityIntensity');
  });
});
