import { createElement } from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SleebyRepository } from '@sleeby/data';
import {
  trackingColors,
  TrackingThemeProvider,
  useTrackingTheme,
} from './theme';
function luminance(hex: string) {
  const rgb = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    (rgb[0] ?? 0) * 0.2126 + (rgb[1] ?? 0) * 0.7152 + (rgb[2] ?? 0) * 0.0722
  );
}
function contrast(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
it.each([false, true])(
  'meets text and control contrast in dark=%s for both preferences',
  (dark) => {
    for (const stronger of [false, true]) {
      const colors = trackingColors(dark, stronger);
      expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(
        stronger ? 7 : 4.5,
      );
      expect(contrast(colors.text, colors.fill)).toBeGreaterThanOrEqual(
        stronger ? 7 : 4.5,
      );
      expect(contrast(colors.border, colors.background)).toBeGreaterThanOrEqual(
        3,
      );
    }
    expect(trackingColors(dark, false).background).not.toBe(
      trackingColors(dark, true).background,
    );
  },
);

it('reads saved contrast on mount, after a preference save and after remount', async () => {
  let strongerContrast = false;
  const repository = {
    readCurrentTrackingSettings: () => ({ value: { strongerContrast } }),
  } as unknown as SleebyRepository;
  function Probe() {
    const theme = useTrackingTheme();
    return createElement(
      Pressable,
      { accessibilityRole: 'button', onPress: theme.refresh },
      createElement(Text, null, theme.background),
    );
  }
  const tree = () =>
    createElement(TrackingThemeProvider, { repository }, createElement(Probe));
  const view = await render(tree());
  expect(screen.getByText(/#f8f5ee|#131a16/)).toBeTruthy();
  strongerContrast = true;
  await fireEvent.press(screen.getByRole('button'));
  expect(screen.getByText(/#ffffff|#000000/)).toBeTruthy();
  await view.unmount();
  await render(tree());
  expect(screen.getByText(/#ffffff|#000000/)).toBeTruthy();
});
