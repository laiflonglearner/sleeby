import { COPY_TEMPLATES } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import { act, render, screen } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { Text } from 'react-native';
import RootLayout from '../app/_layout';
import { openRepository } from './index';
import { useRepository } from './provider';

jest.mock('expo-router', () => ({ Stack: jest.fn(() => null) }));
jest.mock('./index', () => ({ openRepository: jest.fn() }));

const repository = {
  readCurrentTrackingSettings: () => ({
    value: {
      id: 'settings',
      timestamp: {
        utc: '2026-10-09T00:00:00Z',
        reference: { kind: 'iana' as const, zone: 'Asia/Jakarta' },
      },
      target: null,
      dayBoundaryMinutes: 240,
      privacyNoteAcknowledged: true,
      strongerContrast: false,
    },
  }),
} as unknown as SleebyRepository;

function Probe() {
  const active = useRepository();
  return <Text>{active === repository ? 'ready' : 'wrong-repository'}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.mocked(Stack).mockImplementation(() => <Probe />);
});

it('keeps the actual root screens closed until storage is ready', async () => {
  let finish!: (value: SleebyRepository) => void;
  jest.mocked(openRepository).mockReturnValue(
    new Promise((done) => {
      finish = done;
    }),
  );
  await render(<RootLayout />);
  expect(screen.getByText(COPY_TEMPLATES.storageOpening)).toBeTruthy();
  expect(Stack).not.toHaveBeenCalled();
  await act(async () => {
    finish(repository);
  });
  expect(screen.getByText('ready')).toBeTruthy();
});

it('keeps screens closed and hides technical errors when storage fails', async () => {
  let fail!: (reason: Error) => void;
  jest.mocked(openRepository).mockReturnValue(
    new Promise((_, reject) => {
      fail = reject;
    }),
  );
  await render(<RootLayout />);
  await act(async () => {
    fail(new Error('key-missing-database-exists'));
  });
  expect(screen.getByText(COPY_TEMPLATES.storageUnavailable)).toBeTruthy();
  expect(screen.queryByText('key-missing-database-exists')).toBeNull();
  expect(Stack).not.toHaveBeenCalled();
});

it('does not mount screens after the root has unmounted', async () => {
  let finish!: (value: SleebyRepository) => void;
  jest.mocked(openRepository).mockReturnValue(
    new Promise((done) => {
      finish = done;
    }),
  );
  const view = await render(<RootLayout />);
  await view.unmount();
  await act(async () => {
    finish(repository);
  });
  expect(Stack).not.toHaveBeenCalled();
});
