import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Onboarding } from './onboarding';
import Today from '../app/index';
import type { HabitEntry, TrackingSettings } from '@sleeby/domain';

const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn(),
};
let mockRepository: SleebyRepository;

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'choice-attempt'),
}));
jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (effect: () => void) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]),
}));
jest.mock('../db/provider', () => ({ useRepository: () => mockRepository }));

it('does not save the suggestion on mount or exit, then confirms a chosen 06:00', async () => {
  const saveTrackingSettings = jest.fn();
  const repository = { saveTrackingSettings } as unknown as SleebyRepository;
  const first = await render(
    <Onboarding repository={repository} onConfirmed={jest.fn()} />,
  );
  expect(screen.getByText('Day start 04:00')).toBeTruthy();
  expect(saveTrackingSettings).not.toHaveBeenCalled();
  await first.unmount();
  const done = jest.fn();
  await render(<Onboarding repository={repository} onConfirmed={done} />);
  for (let i = 0; i < 2; i++)
    await fireEvent(
      screen.getByRole('adjustable', { name: 'Day start Hour' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Use this time 06:00' }),
  );
  expect(saveTrackingSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'choice-attempt',
      dayBoundaryMinutes: 360,
      target: null,
    }),
    null,
  );
  expect(done).toHaveBeenCalledTimes(1);
});

it('keeps a failed choice visible and retries the same ID', async () => {
  const saveTrackingSettings = jest.fn().mockImplementationOnce(() => {
    throw new Error('private-native-error');
  });
  const done = jest.fn();
  await render(
    <Onboarding
      repository={{ saveTrackingSettings } as unknown as SleebyRepository}
      onConfirmed={done}
    />,
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Use this time 04:00' }),
  );
  expect(screen.getByText(copy.saveFailed)).toBeTruthy();
  expect(screen.queryByText('private-native-error')).toBeNull();
  expect(done).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Use this time 04:00' }),
  );
  expect(saveTrackingSettings.mock.calls[0]?.[0]).toBe(
    saveTrackingSettings.mock.calls[1]?.[0],
  );
  expect(done).toHaveBeenCalledTimes(1);
});

it('keeps Today closed before confirmation and reads preferences and a meal after remount', async () => {
  let preferences: TrackingSettings | null = null;
  let habit: HabitEntry | null = null;
  const saveTrackingSettings = jest.fn((value: TrackingSettings) => {
    preferences = value;
  });
  const saveManualHabit = jest.fn((value: HabitEntry) => {
    habit = value;
  });
  mockRepository = {
    readCurrentTrackingSettings: () =>
      preferences ? { value: preferences, supersedesId: null } : null,
    readCurrentHabit: (key: string) =>
      habit?.keyAssignment.key === key
        ? { value: habit, supersedesId: null }
        : null,
    saveTrackingSettings,
    saveManualHabit,
  } as unknown as SleebyRepository;
  let view = await render(<Today />);
  expect(screen.queryByRole('button', { name: copy.save })).toBeNull();
  expect(saveTrackingSettings).not.toHaveBeenCalled();
  for (let i = 0; i < 2; i++)
    await fireEvent(
      screen.getByRole('adjustable', { name: 'Day start Hour' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Use this time 06:00' }),
  );
  expect(screen.getByText('Day start: 06:00')).toBeTruthy();
  await fireEvent(
    screen.getByRole('switch', { name: copy.lastMeal }),
    'valueChange',
    true,
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(saveManualHabit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: copy.edit })).toBeTruthy();
  await view.unmount();
  view = await render(<Today />);
  expect(screen.queryByText(copy.dayStartTitle)).toBeNull();
  expect(screen.getByText('Day start: 06:00')).toBeTruthy();
  expect(screen.getByRole('button', { name: copy.edit })).toBeTruthy();
  expect(saveTrackingSettings).toHaveBeenCalledTimes(1);
  await view.unmount();
});
