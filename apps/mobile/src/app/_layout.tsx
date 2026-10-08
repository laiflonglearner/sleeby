import { Stack } from 'expo-router';
import { RepositoryProvider } from '../db/provider';

export default function RootLayout() {
  return (
    <RepositoryProvider>
      <Stack />
    </RepositoryProvider>
  );
}
