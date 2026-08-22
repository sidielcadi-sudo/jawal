import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../components/AppHeader';
import { EmptyCard } from '../components/EmptyCard';
import { useAuth } from '../auth';
import { useNav } from '../navigation';
import { api, ApiError, type Announcement } from '../api';
import { colors } from '../theme';

export default function AnnouncementsScreen() {
  const { token, logout } = useAuth();
  const { goBack } = useNav();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const res = await api.announcements(token);
      setItems(res.items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <AppHeader title="Annonces" />
      {loading ? (
        <ActivityIndicator color={colors.brand} size="large" style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
          ListEmptyComponent={
            <EmptyCard text={error || 'Aucune annonce pour le moment.'} />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              {item.publishedAt ? (
                <Text style={styles.date}>{new Date(item.publishedAt).toLocaleDateString('fr-FR')}</Text>
              ) : null}
              <Text style={styles.body}>{item.body}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 16,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  date: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  body: { fontSize: 14, color: colors.text, marginTop: 8, lineHeight: 20 },
});
