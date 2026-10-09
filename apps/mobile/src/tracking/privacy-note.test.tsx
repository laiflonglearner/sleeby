import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import type { TrackingSettings } from '@sleeby/domain';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PrivacyNote } from './privacy-note';
jest.mock('expo-router', () => ({ useNavigation: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'acknowledgement' }));
it('appends acknowledgement only after Continue and retains all confirmed preferences', async () => {
  const settings: TrackingSettings = {
    id: 'settings',
    timestamp: {
      utc: '2026-10-08T13:00:00Z',
      reference: { kind: 'iana', zone: 'Asia/Jakarta' },
    },
    target: null,
    dayBoundaryMinutes: 301,
    privacyNoteAcknowledged: false,
    strongerContrast: true,
  };
  const saveTrackingSettings = jest.fn().mockImplementationOnce(() => {
    throw new Error('private');
  });
  const onSaved = jest.fn();
  await render(
    <PrivacyNote
      repository={{ saveTrackingSettings } as unknown as SleebyRepository}
      settings={settings}
      onSaved={onSaved}
    />,
  );
  expect(screen.getByText(copy.firstOpen)).toBeTruthy();
  expect(saveTrackingSettings).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: copy.continue }));
  expect(screen.getByText(copy.saveFailed)).toBeTruthy();
  expect(onSaved).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: copy.continue }));
  expect(saveTrackingSettings.mock.calls[1]?.[0]).toBe(
    saveTrackingSettings.mock.calls[0]?.[0],
  );
  expect(saveTrackingSettings).toHaveBeenLastCalledWith(
    expect.objectContaining({
      privacyNoteAcknowledged: true,
      strongerContrast: true,
      dayBoundaryMinutes: 301,
      target: null,
    }),
    'settings',
  );
  expect(onSaved).toHaveBeenCalledTimes(1);
});
