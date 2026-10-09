import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import type { HabitEntry, TrackingSettings } from '@sleeby/domain';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { HabitForm } from './habit-form';

const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn(),
};
jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'habit-attempt'),
}));
const timestamp = {
  utc: '2026-10-08T13:37:00.000Z',
  reference: { kind: 'iana', zone: 'Asia/Jakarta' },
} as const;
const settings: TrackingSettings = {
  id: 'settings',
  timestamp,
  target: null,
  dayBoundaryMinutes: 360,
  privacyNoteAcknowledged: false,
  strongerContrast: false,
};
const initial: HabitEntry = {
  id: 'old',
  timestamp,
  keyAssignment: { key: '2026-10-08', boundaryMinutes: 240 },
  monitoring: 'tracked',
  lastMeal: timestamp,
  screenFreeMinutes: 45,
  movementCompleted: false,
};

it('edits an exact saved meal time while keeping the older boundary and other fields', async () => {
  const saveManualHabit = jest.fn();
  await render(
    <HabitForm
      repository={{ saveManualHabit } as unknown as SleebyRepository}
      settings={settings}
      day="2026-10-08"
      initial={initial}
      onSaved={jest.fn()}
      onDirty={jest.fn()}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.edit }));
  expect(
    screen.getByRole('adjustable', { name: 'Last meal Minute' }),
  ).toHaveAccessibilityValue({ now: 37 });
  await fireEvent(
    screen.getByRole('adjustable', { name: 'Last meal Minute' }),
    'accessibilityAction',
    { nativeEvent: { actionName: 'increment' } },
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(saveManualHabit).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'habit-attempt',
      keyAssignment: initial.keyAssignment,
      screenFreeMinutes: 45,
      movementCompleted: false,
      lastMeal: { ...timestamp, utc: '2026-10-08T13:38:00.000Z' },
    }),
    'old',
  );
  expect(initial.lastMeal?.utc).toBe('2026-10-08T13:37:00.000Z');
});

it('keeps the draft and earlier saved value on failure without displaying private errors', async () => {
  const saveManualHabit = jest.fn(() => {
    throw new Error('private-entry');
  });
  await render(
    <HabitForm
      repository={{ saveManualHabit } as unknown as SleebyRepository}
      settings={settings}
      day="2026-10-08"
      initial={initial}
      onSaved={jest.fn()}
      onDirty={jest.fn()}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.edit }));
  await fireEvent(
    screen.getByRole('adjustable', { name: 'Last meal Minute' }),
    'accessibilityAction',
    { nativeEvent: { actionName: 'increment' } },
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(screen.getByText(copy.saveFailed)).toBeTruthy();
  expect(screen.getByText('Last meal: 20:37')).toBeTruthy();
  expect(
    screen.getByRole('adjustable', { name: 'Last meal Minute' }),
  ).toHaveAccessibilityValue({ now: 38 });
  expect(screen.queryByText('private-entry')).toBeNull();
});

it('preserves absent, zero and false as separate saved choices with remaining fields', async () => {
  const saveManualHabit = jest.fn();
  await render(
    <HabitForm
      repository={{ saveManualHabit } as unknown as SleebyRepository}
      settings={settings}
      day="2026-10-08"
      initial={null}
      onSaved={jest.fn()}
      onDirty={jest.fn()}
    />,
  );
  await fireEvent.changeText(
    screen.getByLabelText('Morning sunlight minutes'),
    '0',
  );
  await fireEvent.changeText(
    screen.getByLabelText('Afternoon sunlight minutes'),
    '12',
  );
  await fireEvent.changeText(screen.getByLabelText('Movement minutes'), '0');
  await fireEvent.press(
    screen.getByRole('radio', { name: 'Movement completed: No' }),
  );
  await fireEvent.press(
    screen.getByRole('radio', { name: `${copy.caffeineFree}: No` }),
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  const value = saveManualHabit.mock.calls[0]?.[0] as HabitEntry;
  expect(value).toMatchObject({
    morningSunlightMinutes: 0,
    afternoonSunlightMinutes: 12,
    movementMinutes: 0,
    movementCompleted: false,
    caffeineFree: false,
    monitoring: 'tracked',
  });
  expect(value).not.toHaveProperty('screenFreeMinutes');
  expect(value).not.toHaveProperty('lastCaffeine');
});
it('blocks conflicting caffeine choices and invalid durations, then saves a rest day without erasing values', async () => {
  const saveManualHabit = jest.fn();
  await render(
    <HabitForm
      repository={{ saveManualHabit } as unknown as SleebyRepository}
      settings={settings}
      day="2026-10-08"
      initial={initial}
      onSaved={jest.fn()}
      onDirty={jest.fn()}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.edit }));
  await fireEvent(
    screen.getByRole('switch', { name: 'Last caffeine' }),
    'valueChange',
    true,
  );
  await fireEvent.press(
    screen.getByRole('radio', { name: `${copy.caffeineFree}: Yes` }),
  );
  expect(screen.getByRole('button', { name: copy.save })).toBeDisabled();
  await fireEvent(
    screen.getByRole('switch', { name: 'Last caffeine' }),
    'valueChange',
    false,
  );
  for (const invalid of ['-1', '1.5', 'Infinity']) {
    await fireEvent.changeText(
      screen.getByLabelText('Morning sunlight minutes'),
      invalid,
    );
    expect(screen.getByRole('button', { name: copy.save })).toBeDisabled();
  }
  await fireEvent.changeText(
    screen.getByLabelText('Morning sunlight minutes'),
    '',
  );
  await fireEvent.press(screen.getByRole('radio', { name: copy.rest }));
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(saveManualHabit).toHaveBeenCalledWith(
    expect.objectContaining({
      monitoring: 'rest',
      caffeineFree: true,
      screenFreeMinutes: 45,
      movementCompleted: false,
    }),
    'old',
  );
});
