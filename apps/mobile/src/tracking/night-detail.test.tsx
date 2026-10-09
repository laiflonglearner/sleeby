import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import type { Night, SleepRecord } from '@sleeby/domain';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NightDetail } from './night-detail';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: jest.fn(),
  useFocusEffect: (callback: () => void) =>
    jest.requireActual('react').useEffect(callback, [callback]),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'choice' }));
const stamp = {
  utc: '2026-10-08T16:00:00.000Z',
  reference: { kind: 'iana', zone: 'Asia/Jakarta' },
} as const;
const keyAssignment = { key: '2026-10-08', boundaryMinutes: 240 };
const old: Night = {
  id: 'old-night',
  keyAssignment,
  primarySessionId: null,
  sessionIds: ['old-sleep'],
  target: null,
};
const current: Night = {
  ...old,
  id: 'current-night',
  primarySessionId: 'new-sleep',
  sessionIds: ['new-sleep'],
};
const sleep = (id: string): SleepRecord => ({
  id,
  type: 'sleepSession',
  source: 'manual',
  origin: 'org.sleeby.app',
  device: null,
  recordingMethod: 'manual',
  externalId: null,
  lastModifiedUtc: stamp.utc,
  start: stamp,
  end: {
    ...stamp,
    utc:
      id === 'old-sleep'
        ? '2026-10-09T00:00:00.000Z'
        : '2026-10-09T00:30:00.000Z',
  },
  keyAssignment,
  rawPayload: null,
  payload: { stages: [] },
});

it('shows saved current and prior values and fetches the next bounded ancestry page', async () => {
  const readNightHistoryPage = jest
    .fn()
    .mockReturnValueOnce({
      revisions: [{ value: current, supersedesId: old.id }],
      nextCursor: old.id,
    })
    .mockReturnValue({
      revisions: [{ value: old, supersedesId: null }],
      nextCursor: null,
    });
  const readSleepByIds = jest.fn((ids: readonly string[]) => ids.map(sleep));
  await render(
    <NightDetail
      repository={
        { readNightHistoryPage, readSleepByIds } as unknown as SleebyRepository
      }
      nightKey={keyAssignment.key}
    />,
  );
  expect(
    screen.getByText(
      '2026-10-08 23:00 to 2026-10-09 07:30 (510 minutes) (Main sleep)',
    ),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'More past edits' }),
  );
  expect(readNightHistoryPage).toHaveBeenLastCalledWith(
    keyAssignment.key,
    10,
    old.id,
  );
  expect(
    screen.getByText('2026-10-08 23:00 to 2026-10-09 07:00 (480 minutes)'),
  ).toBeTruthy();
  expect(screen.getByText(copy.mainSleepMissing)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Add sleep' }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/sleep-entry',
    params: { key: keyAssignment.key },
  });
});
