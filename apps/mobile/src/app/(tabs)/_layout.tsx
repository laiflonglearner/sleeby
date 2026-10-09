import { Tabs } from 'expo-router';
import { Text, useWindowDimensions } from 'react-native';
import { confirmDraftExit } from '../../tracking/state';
import { useTrackingTheme } from '../../tracking/theme';
export default function TrackingTabs() {
  const theme = useTrackingTheme();
  const { fontScale } = useWindowDimensions();
  return (
    <Tabs
      screenListeners={({ navigation }) => ({
        tabPress: (event) => {
          if (!theme.dirty) return;
          const route = navigation
            .getState()
            .routes.find((item) => item.key === event.target);
          if (
            !route ||
            route.key ===
              navigation.getState().routes[navigation.getState().index]?.key
          )
            return;
          event.preventDefault();
          confirmDraftExit(true, () => {
            theme.setDirty(false);
            navigation.navigate(route.name);
          });
        },
      })}
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        tabBarStyle: {
          backgroundColor: theme.background,
          height: 72 * Math.max(1, fontScale),
        },
        tabBarItemStyle: { minHeight: 48 },
        tabBarIconStyle: { display: 'none' },
        tabBarLabel: ({ focused, children }) => (
          <Text
            style={{
              color: theme.text,
              fontSize: 16,
              textAlign: 'center',
              fontWeight: focused ? '700' : '400',
              textDecorationLine: focused ? 'underline' : 'none',
            }}
          >
            {children}
          </Text>
        ),
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarAccessibilityLabel: 'Today' }}
      />
      <Tabs.Screen
        name="nights"
        options={{ title: 'Nights', tabBarAccessibilityLabel: 'Nights' }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarAccessibilityLabel: 'Settings' }}
      />
    </Tabs>
  );
}
