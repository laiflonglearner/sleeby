import { act, renderHook } from '@testing-library/react-native';
import { habitTime, nextDate, useSaveOperation, validDate } from './state';

jest.mock('expo-router', () => ({ useNavigation: jest.fn() }));

it('keeps a late habit time inside the selected day under its saved boundary', () => {
  const value = habitTime(
    { key: '2026-10-08', boundaryMinutes: 240 },
    30,
    'Asia/Jakarta',
  );
  expect(value.date).toBe('2026-10-09');
  expect(value.candidates[0]?.utc).toBe('2026-10-08T17:30:00.000Z');
  expect(nextDate('2026-12-31')).toBe('2027-01-01');
  expect(validDate('2026-02-30')).toBe(false);
});

it('uses the same operation on a failed-write retry and on double taps', async () => {
  const write = jest.fn().mockImplementationOnce(() => {
    throw new Error('synthetic');
  });
  const read = jest.fn();
  const build = jest.fn(() => ({ id: 'fixed-attempt' }));
  const hook = await renderHook(() => useSaveOperation(write, read));
  await act(async () => {
    hook.result.current.save(build);
  });
  expect(hook.result.current.status).toBe('write-failed');
  await act(async () => {
    hook.result.current.save(build);
    hook.result.current.save(build);
  });
  expect(build).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[0]?.[0]).toBe(write.mock.calls[1]?.[0]);
  expect(hook.result.current.status).toBe('saved');
});

it('retries only the read after commit and keeps a stale conflict closed', async () => {
  const write = jest.fn();
  const read = jest.fn().mockImplementationOnce(() => {
    throw new Error('synthetic-read');
  });
  const hook = await renderHook(() => useSaveOperation(write, read));
  await act(async () => {
    hook.result.current.save(() => 'original');
  });
  expect(hook.result.current.status).toBe('read-failed');
  await act(async () => {
    hook.result.current.change();
    hook.result.current.save(() => 'different');
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(hook.result.current.status).toBe('saved');
  const conflict = jest.fn(() => {
    throw new RangeError('stale-entry');
  });
  const stale = await renderHook(() => useSaveOperation(conflict, read));
  await act(async () => {
    stale.result.current.save(() => 'old');
  });
  expect(stale.result.current.status).toBe('conflict');
  await act(async () => {
    stale.result.current.save(() => 'new');
  });
  expect(conflict).toHaveBeenCalledTimes(1);
});
