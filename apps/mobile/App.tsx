import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth';
import { AppStateProvider } from './src/app-state';
import { TeacherStateProvider } from './src/teacher-state';
import { AlertsProvider } from './src/alerts';
import { subscribeToNotificationTaps } from './src/push';
import { NavigationProvider, useNav } from './src/navigation';
import { DrawerMenu } from './src/components/DrawerMenu';
import { TeacherDrawer } from './src/components/TeacherDrawer';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import AnnouncementsScreen from './src/screens/AnnouncementsScreen';
import ChildDetailScreen from './src/screens/ChildDetailScreen';
import MessagesScreen from './src/screens/MessagesScreen';
import ThreadScreen from './src/screens/ThreadScreen';
import PlaceholderScreen from './src/screens/PlaceholderScreen';
import TeacherHomeScreen from './src/screens/TeacherHomeScreen';
import TeacherTabsScreen from './src/screens/TeacherTabsScreen';
import TeacherNotesScreen from './src/screens/TeacherNotesScreen';
import AppelScreen from './src/screens/AppelScreen';
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

/** Écrans de l'espace parent. */
function ParentScreens() {
  const { route } = useNav();
  switch (route.name) {
    case 'child':
      return <ChildDetailScreen initialTab={route.tab} />;
    case 'announcements':
      return <AnnouncementsScreen />;
    case 'messages':
      return <MessagesScreen />;
    case 'thread':
      return <ThreadScreen conversationId={route.conversationId} subject={route.subject} />;
    case 'placeholder':
      return <PlaceholderScreen title={route.title} note={route.note} />;
    case 'home':
    default:
      return <HomeScreen />;
  }
}

/** Écrans de l'espace enseignant. */
function TeacherScreens() {
  const { route } = useNav();
  switch (route.name) {
    case 'teacher':
      return <TeacherTabsScreen initialTab={route.tab} />;
    case 'appel':
      return <AppelScreen entryId={route.entryId} date={route.date} />;
    case 'teacherNotes':
      return (
        <TeacherNotesScreen classId={route.classId} subjectId={route.subjectId} title={route.title} />
      );
    case 'messages':
      return <MessagesScreen />;
    case 'thread':
      return <ThreadScreen conversationId={route.conversationId} subject={route.subject} />;
    case 'placeholder':
      return <PlaceholderScreen title={route.title} note={route.note} />;
    case 'home':
    default:
      return <TeacherHomeScreen />;
  }
}

/**
 * Une seule app, deux espaces : le rôle scellé dans le jeton à la connexion
 * décide de l'arbre d'écrans monté. Parent et enseignant partagent le design,
 * la navigation et la messagerie, mais rien de leurs données.
 */
function Root() {
  const { token, role, loading } = useAuth();
  if (loading) return <Splash />;
  if (!token) return <LoginScreen />;

  if (role === 'teacher') {
    return (
      <NavigationProvider>
        <TeacherStateProvider>
          <PushListener />
          <TeacherScreens />
          <TeacherDrawer />
        </TeacherStateProvider>
      </NavigationProvider>
    );
  }

  return (
    <NavigationProvider>
      <AppStateProvider>
        <PushListener />
        <ParentScreens />
        <DrawerMenu />
      </AppStateProvider>
    </NavigationProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        {/* Les alertes de la cloche sont rattachées au compte, pas au rôle :
            un seul fournisseur au-dessus des deux espaces. */}
        <AlertsProvider>
          <Root />
        </AlertsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
