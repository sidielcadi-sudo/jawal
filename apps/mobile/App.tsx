import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth';
import { subscribeToNotificationTaps } from './src/push';
import { NavigationProvider, useNav } from './src/navigation';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import AnnouncementsScreen from './src/screens/AnnouncementsScreen';
import ChildDetailScreen from './src/screens/ChildDetailScreen';
import MessagesScreen from './src/screens/MessagesScreen';
import ThreadScreen from './src/screens/ThreadScreen';
import { colors } from './src/theme';

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

/** Ouvre l'écran pertinent quand l'utilisateur tape une notification. */
function PushListener() {
  const { navigate } = useNav();
  useEffect(() => {
    // No-op en Expo Go (push retiré depuis SDK 53).
    return subscribeToNotificationTaps((data) => {
      if (data?.type === 'announcement') navigate({ name: 'announcements' });
      else if (data?.type === 'message') {
        if (data.conversationId) navigate({ name: 'thread', conversationId: data.conversationId });
        else navigate({ name: 'messages' });
      }
    });
  }, [navigate]);
  return null;
}

function Screens() {
  const { route } = useNav();
  switch (route.name) {
    case 'child':
      return <ChildDetailScreen childId={route.childId} childName={route.childName} />;
    case 'announcements':
      return <AnnouncementsScreen />;
    case 'messages':
      return <MessagesScreen />;
    case 'thread':
      return <ThreadScreen conversationId={route.conversationId} subject={route.subject} />;
    case 'home':
    default:
      return <HomeScreen />;
  }
}

function Root() {
  const { token, loading } = useAuth();
  if (loading) return <Splash />;
  if (!token) return <LoginScreen />;
  return (
    <NavigationProvider>
      <PushListener />
      <Screens />
    </NavigationProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
