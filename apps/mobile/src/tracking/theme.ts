import {
  createContext,
  createElement,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import type { SleebyRepository } from '@sleeby/data';
/** Temporary calm colors keep text and control boundaries readable. */
export function trackingColors(dark: boolean, stronger: boolean) {
  return dark
    ? {
        background: stronger ? '#000000' : '#131a16',
        text: '#f5f5ef',
        fill: stronger ? '#172018' : '#354336',
        border: '#aeb9a8',
      }
    : {
        background: stronger ? '#ffffff' : '#f8f5ee',
        text: stronger ? '#101710' : '#22271f',
        fill: stronger ? '#eef3ea' : '#dbe5d4',
        border: '#52614b',
      };
}
const ThemeContext = createContext({
  stronger: false,
  refresh: () => {},
  dirty: false,
  setDirty: (_dirty: boolean) => {},
});
export function TrackingThemeProvider({
  children,
  repository,
}: {
  children?: ReactNode;
  repository: SleebyRepository;
}) {
  const read = () =>
    repository.readCurrentTrackingSettings()?.value.strongerContrast ?? false;
  const [stronger, setStronger] = useState(() => {
    try {
      return read();
    } catch {
      return false;
    }
  });
  const [dirty, setDirty] = useState(false);
  return createElement(
    ThemeContext.Provider,
    {
      value: { stronger, refresh: () => setStronger(read()), dirty, setDirty },
    },
    children,
  );
}
export function useTrackingTheme() {
  const context = useContext(ThemeContext);
  return {
    ...trackingColors(useColorScheme() === 'dark', context.stronger),
    refresh: context.refresh,
    dirty: context.dirty,
    setDirty: context.setDirty,
  };
}
