import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useNav } from '../navigation';
import { api, ApiError, type Child, type Me } from '../api';
import { colors } from '../theme';

export default function HomeScreen() {
  const { token, logout } = useAuth();
  const { navigate } = useNav();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      setMe(await api.me(token));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await logout();
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Bonjour</Text>
          <Text style={styles.name}>{me?.user.name ?? me?.user.email ?? 'Parent'}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logout}>
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.annCard} onPress={() => navigate({ name: 'announcements' })}>
        <Text style={styles.annIcon}>📣</Text>
        <Text style={styles.annText}>Annonces de l’établissement</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.annCard} onPress={() => navigate({ name: 'messages' })}>
        <Text style={styles.annIcon}>✉️</Text>
        <Text style={styles.annText}>Messagerie avec l’école</Text>
        {me && me.unreadMessages > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{me.unreadMessages}</Text>
          </View>
        ) : null}
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.testBtn}
        onPress={async () => {
          if (!token) return;
          try {
            const r = await api.testPush(token);
            Alert.alert('Notification de test', r.devices > 0 ? 'Envoyée. Vérifiez la barre de notifications.' : 'Aucun appareil enregistré (autorisez les notifications).');
          } catch {
            Alert.alert('Erreur', 'Envoi impossible.');
          }
        }}
      >
        <Text style={styles.testBtnText}>🔔 Tester une notification</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Mes enfants</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={me?.children ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucun enfant rattaché à ce compte.</Text>}
        renderItem={({ item }: { item: Child }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigate({ name: 'child', childId: item.id, childName: `${item.firstName} ${item.lastName}` })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.firstName.charAt(0)}
                {item.lastName.charAt(0)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.childName}>
                {item.firstName} {item.lastName}
              </Text>
              {item.className ? <Text style={styles.childClass}>{item.className}</Text> : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  hello: { fontSize: 13, color: colors.textMuted },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  logout: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  logoutText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  annCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#EFF3FF',
    borderWidth: 1,
    borderColor: '#DBE4FF',
  },
  annIcon: { fontSize: 18, marginRight: 10 },
  annText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.brandDark },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  testBtn: { marginHorizontal: 16, marginBottom: 4, paddingVertical: 6, alignItems: 'center' },
  testBtnText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  error: { color: colors.danger, paddingHorizontal: 16, marginBottom: 8 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: colors.white, fontWeight: '800' },
  childName: { fontSize: 16, fontWeight: '700', color: colors.text },
  childClass: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textMuted, marginLeft: 8 },
});
