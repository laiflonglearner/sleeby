import { fireEvent, render, screen } from '@testing-library/react-native';
import { TimeCandidates, TimeEntry } from './time-entry';

jest.mock('expo-router', () => ({ useNavigation: jest.fn() }));

it('keeps an exact saved minute and supports both adjustable wheels', async () => {
  const change = jest.fn();
  await render(
    <TimeEntry label="Last meal" value={20 * 60 + 37} onChange={change} />,
  );
  expect(
    screen.getByRole('adjustable', { name: 'Last meal Minute' }),
  ).toHaveAccessibilityValue({ now: 37 });
  await fireEvent(
    screen.getByRole('adjustable', { name: 'Last meal Minute' }),
    'accessibilityAction',
    { nativeEvent: { actionName: 'increment' } },
  );
  expect(change).toHaveBeenLastCalledWith(20 * 60 + 38);
  await fireEvent(
    screen.getByRole('adjustable', { name: 'Last meal Hour' }),
    'accessibilityAction',
    { nativeEvent: { actionName: 'decrement' } },
  );
  expect(change).toHaveBeenLastCalledWith(19 * 60 + 37);
  await fireEvent(
    screen.getByRole('adjustable', { name: 'Last meal Minute' }),
    'scrollEndDrag',
    {
      nativeEvent: {
        contentOffset: {
          x: 0,
          y:
            38 *
            Number(
              screen.getByRole('adjustable', { name: 'Last meal Minute' }).props
                .snapToInterval,
            ),
        },
        velocity: { x: 0, y: 0 },
      },
    },
  );
  expect(change).toHaveBeenLastCalledWith(20 * 60 + 38);
});

it('leaves a repeated local time unchosen until a specific occurrence is pressed', async () => {
  const candidates = [
    '2026-11-01T05:30:00.000Z',
    '2026-11-01T06:30:00.000Z',
  ].map((utc) => ({
    utc,
    reference: { kind: 'iana' as const, zone: 'America/New_York' },
  }));
  const choose = jest.fn();
  await render(
    <TimeCandidates
      status="repeated"
      candidates={candidates}
      chosen={null}
      onChoose={choose}
    />,
  );
  expect(choose).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('radio', { name: /Second:/ }));
  expect(choose).toHaveBeenCalledWith(candidates[1]);
});
