import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import type { TrackingSettings } from '@sleeby/domain';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SettingsForm } from './settings-form';
jest.mock('expo-router', () => ({
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()) }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-settings' }));
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
      onChange: (value: number) => void;
    }) =>
      React.createElement(
        Pressable,
        {
          accessibilityRole: 'adjustable',
          accessibilityLabel: `${label} Minute`,
          accessibilityValue: { now: value % 60 },
          onAccessibilityAction: () => onChange(value + 1),
        },
        React.createElement(Text, null, String(value)),
      ),
  };
});
const initial: TrackingSettings = {
  id: 'settings',
  timestamp: {
    utc: '2026-10-08T13:00:00Z',
    reference: { kind: 'iana', zone: 'Asia/Jakarta' },
  },
  target: { bedtimeMinutes: 1387, wakeMinutes: 427 },
  dayBoundaryMinutes: 240,
  privacyNoteAcknowledged: true,
  strongerContrast: false,
};
it('saves exact targets, explicit boundary and contrast, then reads the saved choices on remount', async () => {
  const saveTrackingSettings = jest.fn();
  const repository = { saveTrackingSettings } as unknown as SleebyRepository;
  const view = await render(
    <SettingsForm
      repository={repository}
      initial={initial}
      onSaved={jest.fn()}
    />,
  );
  expect(
    screen.getByRole('switch', { name: 'Stronger contrast' }).props.value,
  ).toBe(false);
  await fireEvent(
    screen.getByRole('adjustable', { name: 'Day start Minute' }),
    'accessibilityAction',
    { nativeEvent: { actionName: 'increment' } },
  );
  await fireEvent(
    screen.getByRole('switch', { name: 'Stronger contrast' }),
    'valueChange',
    true,
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  const saved = saveTrackingSettings.mock.calls[0]?.[0] as TrackingSettings;
  expect(saved).toMatchObject({
    target: initial.target,
    dayBoundaryMinutes: 241,
    strongerContrast: true,
    privacyNoteAcknowledged: true,
  });
  expect(saveTrackingSettings).toHaveBeenCalledWith(saved, initial.id);
  expect(initial.dayBoundaryMinutes).toBe(240);
  await view.unmount();
  await render(
    <SettingsForm
      repository={repository}
      initial={saved}
      onSaved={jest.fn()}
    />,
  );
  expect(
    screen.getByRole('switch', { name: 'Stronger contrast' }).props.value,
  ).toBe(true);
  expect(
    screen.getByRole('adjustable', { name: 'Target bedtime Minute' }),
  ).toHaveAccessibilityValue({ now: 7 });
  expect(
    screen.getByRole('adjustable', { name: 'Day start Minute' }),
  ).toHaveAccessibilityValue({ now: 1 });
});
it('clears a target explicitly and keeps a failed settings draft for the same retry', async () => {
  const saveTrackingSettings = jest.fn().mockImplementationOnce(() => {
    throw new Error('private');
  });
  await render(
    <SettingsForm
      repository={{ saveTrackingSettings } as unknown as SleebyRepository}
      initial={initial}
      onSaved={jest.fn()}
    />,
  );
  await fireEvent(
    screen.getByRole('switch', { name: 'Sleep target' }),
    'valueChange',
    false,
  );
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(screen.getByText(copy.saveFailed)).toBeTruthy();
  expect(
    screen.queryByRole('adjustable', { name: 'Target bedtime Minute' }),
  ).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(saveTrackingSettings.mock.calls[1]?.[0]).toBe(
    saveTrackingSettings.mock.calls[0]?.[0],
  );
  expect(saveTrackingSettings.mock.calls[1]?.[0]).toMatchObject({
    target: null,
    dayBoundaryMinutes: 240,
  });
});
