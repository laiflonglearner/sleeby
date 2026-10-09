import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { useRepository } from '../../db/provider';
import { NightDetail } from '../../tracking/night-detail';
import { validDate } from '../../tracking/state';

export default function NightRoute() {
  const repository = useRepository();
  const params = useLocalSearchParams<{ key: string; choose?: string }>();
  if (typeof params.key !== 'string' || !validDate(params.key))
    return <Text>Choose a saved night.</Text>;
  return (
    <NightDetail
      repository={repository}
      nightKey={params.key}
      askMain={params.choose === '1'}
    />
  );
}
