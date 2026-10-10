import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import type { Night, SleepRecord, TrackingSettings } from '@sleeby/domain';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SleepForm } from './sleep-form';

// The large native wheels are tested separately in time-entry.test.tsx.
jest.mock('./time-entry', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TimeEntry: ({
      label,
      value,
      onChange,
    }: {
      label: string;
      value: number;
      onChange: (minutes: number) => void;
    }) =>
      React.createElement(
        Pressable,
        {
          accessibilityRole: 'adjustable',
          accessibilityLabel: `${label} Minute`,
          accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
          onAccessibilityAction: (event: {
            nativeEvent: { actionName: string };
          }) => {
            const minute = value % 60;
            onChange(
              Math.floor(value / 60) * 60 +
                ((minute +
                  (event.nativeEvent.actionName === 'increment' ? 1 : 59)) %
                  60),
            );
          },
        },
        React.createElement(Text, null, String(value % 60)),
      ),
    TimeCandidates: () => null,
  };
});

let mockBeforeRemove:
  | ((event: { preventDefault: () => void; data: { action: unknown } }) => void)
  | undefined;
const mockNavigation = {
  addListener: jest.fn(
    (_name: string, listener: NonNullable<typeof mockBeforeRemove>) => {
      mockBeforeRemove = listener;
      return jest.fn();
    },
  ),
  dispatch: jest.fn(),
};
jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));
jest.mock('expo-crypto', () => ({
  randomUUID: jest
    .fn()
    .mockReturnValueOnce('sleep-new')
    .mockReturnValueOnce('night-new')
    .mockReturnValue('retry-id'),
}));
const stamp = {
  utc: '2026-10-08T16:00:00.000Z',
  reference: { kind: 'iana', zone: 'Asia/Jakarta' },
} as const;
const assignment = { key: '2026-10-08', boundaryMinutes: 240 };
const settings: TrackingSettings = {
  id: 'settings',
  timestamp: stamp,
  target: null,
  dayBoundaryMinutes: 360,
  privacyNoteAcknowledged: false,
  strongerContrast: false,
};
const sleep: SleepRecord = {
  id: 'sleep-old',
  type: 'sleepSession',
  source: 'manual',
  origin: 'org.sleeby.app',
  device: null,
  recordingMethod: 'manual',
  externalId: null,
  lastModifiedUtc: stamp.utc,
  start: stamp,
  end: { ...stamp, utc: '2026-10-09T00:00:00.000Z' },
  keyAssignment: assignment,
  rawPayload: null,
  payload: { stages: [] },
};
const night: Night = {
  id: 'night-old',
  keyAssignment: assignment,
  sessionIds: [sleep.id, 'another'],
  primarySessionId: sleep.id,
  target: null,
};

it('shows both dates and 480 elapsed minutes, then saves a revision with the old assignment and membership', async () => {
  const saveManualSleep = jest.fn();
  const preventDefault = jest.fn();
  const onSaved = jest.fn(() =>
    mockBeforeRemove?.({
      preventDefault,
      data: { action: 'saved-navigation' },
    }),
  );
  await render(
    <SleepForm
      repository={{ saveManualSleep } as unknown as SleebyRepository}
      settings={settings}
      day={assignment.key}
      night={night}
      initial={sleep}
      onSaved={onSaved}
    />,
  );
  expect(
    screen.getByText('Sleep: 2026-10-08 to 2026-10-09 (Asia/Jakarta)'),
  ).toBeTruthy();
  expect(screen.getByText('480 minutes')).toBeTruthy();
  await fireEvent(
    screen.getByRole('adjustable', { name: 'Wake Minute' }),
    'accessibilityAction',
    { nativeEvent: { actionName: 'increment' } },
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(saveManualSleep).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'sleep-new',
      keyAssignment: assignment,
      end: { ...stamp, utc: '2026-10-09T00:01:00.000Z' },
    }),
    expect.objectContaining({
      id: 'night-new',
      primarySessionId: 'sleep-new',
      sessionIds: ['sleep-new', 'another'],
      target: null,
    }),
    'night-old',
    'sleep-old',
  );
  expect(onSaved).toHaveBeenCalledWith(assignment.key);
  expect(preventDefault).not.toHaveBeenCalled();
  expect(sleep.end.utc).toBe('2026-10-09T00:00:00.000Z');
});

it('blocks equal clocks and retains a failed edit for retry', async () => {
  const saveManualSleep = jest.fn(() => {
    throw new Error('private-sleep');
  });
  const view = await render(
    <SleepForm
      repository={{ saveManualSleep } as unknown as SleebyRepository}
      settings={settings}
      day={assignment.key}
      night={night}
      initial={{ ...sleep, end: sleep.start }}
      onSaved={jest.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: copy.save })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(saveManualSleep).not.toHaveBeenCalled();
  await fireEvent(
    screen.getByRole('adjustable', { name: 'Wake Minute' }),
    'accessibilityAction',
    { nativeEvent: { actionName: 'increment' } },
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(screen.getByText(copy.saveFailed)).toBeTruthy();
  expect(screen.queryByText('private-sleep')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(saveManualSleep.mock.calls[0]).toEqual(saveManualSleep.mock.calls[1]);
  await view.unmount();
});

it('keeps the exact saved wake instant when only the sleep minute changes', async () => {
  const saveManualSleep = jest.fn();
  const preciseEnd = { ...sleep.end, utc: '2026-10-09T00:00:00.123456789Z' };
  await render(
    <SleepForm
      repository={{ saveManualSleep } as unknown as SleebyRepository}
      settings={settings}
      day={assignment.key}
      night={night}
      initial={{ ...sleep, end: preciseEnd }}
      onSaved={jest.fn()}
    />,
  );
  await fireEvent(
    screen.getByRole('adjustable', { name: 'Sleep Minute' }),
    'accessibilityAction',
    { nativeEvent: { actionName: 'increment' } },
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(saveManualSleep).toHaveBeenCalledWith(
    expect.objectContaining({ end: preciseEnd }),
    expect.anything(),
    night.id,
    sleep.id,
  );
});
