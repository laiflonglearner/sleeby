import type { SleebyRepository } from '@sleeby/data';
import type { Night, SleepRecord } from '@sleeby/domain';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MainSleepChoice } from './main-sleep-choice';

jest.mock('expo-router', () => ({ useNavigation: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'chosen-night' }));
const stamp = {
  utc: '2026-10-08T16:00:00.000Z',
  reference: { kind: 'iana', zone: 'Asia/Jakarta' },
} as const;
const keyAssignment = { key: '2026-10-08', boundaryMinutes: 240 };
const sleeps: readonly SleepRecord[] = ['first', 'second'].map((id, index) => ({
  id,
  type: 'sleepSession',
  source: 'manual',
  origin: 'org.sleeby.app',
  recordingMethod: 'manual',
  device: null,
  externalId: null,
  lastModifiedUtc: stamp.utc,
  start: stamp,
  end: {
    ...stamp,
    utc: index ? '2026-10-09T01:00:00.000Z' : '2026-10-09T00:00:00.000Z',
  },
  keyAssignment,
  payload: { stages: [] },
  rawPayload: null,
}));
const night: Night = {
  id: 'edited-night',
  keyAssignment,
  primarySessionId: 'first',
  sessionIds: ['first', 'second'],
  target: null,
};

it.each(['first', null])(
  'dismisses without changing the saved choice %s, including after remount',
  async (primarySessionId) => {
    const saveMainSleepChoice = jest.fn();
    const props = {
      repository: { saveMainSleepChoice } as unknown as SleebyRepository,
      night: { ...night, primarySessionId },
      sleeps,
      onSaved: jest.fn(),
      onDismiss: jest.fn(),
    };
    const view = await render(<MainSleepChoice {...props} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(saveMainSleepChoice).not.toHaveBeenCalled();
    await view.unmount();
    await render(<MainSleepChoice {...props} />);
    expect(
      screen.getAllByRole('button')[0]?.props.accessibilityState.selected,
    ).toBe(primarySessionId === 'first');
  },
);

it.each([0, 1])(
  'appends a choice for either interval using the edited Night predecessor (%s)',
  async (index) => {
    const saveMainSleepChoice = jest.fn();
    await render(
      <MainSleepChoice
        repository={{ saveMainSleepChoice } as unknown as SleebyRepository}
        night={night}
        sleeps={sleeps}
        onSaved={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getAllByRole('button')[index]!);
    expect(saveMainSleepChoice).toHaveBeenCalledWith(
      { ...night, id: 'chosen-night', primarySessionId: sleeps[index]!.id },
      'edited-night',
    );
  },
);
