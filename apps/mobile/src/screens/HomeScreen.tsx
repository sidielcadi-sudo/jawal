import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useAppState } from '../app-state';
import { useNav } from '../navigation';
import { api, ApiError, type Homework, type UpcomingExam } from '../api';
import { AppHeader } from '../components/AppHeader';
import { colors } from '../theme';

/** Formate un ISO YYYY-MM-DD en libellé « lun. 21 juil. ». */
function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export default function HomeScreen() {
  const { token, logout } = useAuth();
  const { selectedChild, loading: meLoading } = useAppState();
  const { navigate } = useNav();
  const insets = useSafeAreaInsets();

  const [exams, setExams] = useState<UpcomingExam[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const childId = selectedChild?.id ?? null;

  const load = useCallback(async () => {
    if (!token || !childId) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const [up, cah] = await Promise.all([api.upcoming(token, childId), api.cahier(token, childId)]);
      setExams(up.items);
      setHomeworks(cah.homeworks);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [token, childId, logout]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Devoirs groupés par date d'échéance (les plus proches d'abord).
  const withDue = homeworks.filter((h) => h.dueDate);
  const byDay = new Map<string, Homework[]>();
  for (const h of withDue) {
    const d = h.dueDate!.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), h]);
  }
  const days = [...byDay.keys()].sort();

  return (
    <View style={styles.container}>
      <AppHeader title="Page d'accueil" />

      {meLoading || loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : !selectedChild ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>Aucun enfant rattaché à ce compte.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Prochains DS */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Prochains DS</Text>
            <TouchableOpacity onPress={() => navigate({ name: 'child', tab: 'notes' })}>
              <Text style={styles.seeAll}>Tout voir ↗</Text>
            </TouchableOpacity>
          </View>
          {exams.length === 0 ? (
            <Text style={styles.emptyLine}>Aucun contrôle programmé.</Text>
          ) : (
            exams.slice(0, 3).map((e) => (
              <View key={e.id} style={styles.card}>
                <View style={styles.dateChip}>
                  <Text style={styles.dateChipDay}>{new Date(`${e.date}T00:00:00Z`).getUTCDate()}</Text>
                  <Text style={styles.dateChipMonth}>
                    {new Date(`${e.date}T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.examSubject}>{e.subject.toUpperCase()}</Text>
                  <Text style={styles.examLabel}>{e.label}</Text>
                  <Text style={styles.examDate}>{dayLabel(e.date)}</Text>
                </View>
              </View>
            ))
          )}

          {/* Travail à faire */}
          <View style={[styles.sectionHead, { marginTop: 22 }]}>
            <Text style={styles.sectionTitle}>Travail à faire pour les prochains jours</Text>
            <TouchableOpacity onPress={() => navigate({ name: 'child', tab: 'cahier' })}>
              <Text style={styles.seeAll}>Tout voir ↗</Text>
            </TouchableOpacity>
          </View>
          {days.length === 0 ? (
            <Text style={styles.emptyLine}>Aucun devoir à venir.</Text>
          ) : (
            days.map((d) => (
              <View key={d} style={{ marginBottom: 12 }}>
                <View style={styles.dayPill}>
                  <Text style={styles.dayPillText}>Pour {dayLabel(d)}</Text>
                </View>
                {byDay.get(d)!.map((h) => (
                  <View key={h.id} style={styles.hwRow}>
                    <View style={styles.hwBar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hwSubject}>{(h.subject ?? '—').toUpperCase()}</Text>
                      <Text style={styles.hwDesc}>{h.description}</Text>
                    </View>
                    <View style={styles.notDone}>
                      <Text style={styles.notDoneText}>Non fait</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textMuted },
  emptyLine: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  error: { color: colors.danger, marginBottom: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.brandDark },
  seeAll: { fontSize: 12, fontWeight: '700', color: colors.brand },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  dateChip: {
    width: 46,
    borderRadius: 10,
    backgroundColor: '#DFF3EE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dateChipDay: { fontSize: 18, fontWeight: '900', color: colors.brandDark },
  dateChipMonth: { fontSize: 11, fontWeight: '700', color: colors.brand, textTransform: 'lowercase' },
  examSubject: { fontSize: 14, fontWeight: '800', color: colors.text },
  examLabel: { fontSize: 13, color: colors.text, marginTop: 1 },
  examDate: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  dayPill: { alignSelf: 'flex-start', backgroundColor: '#DFF3EE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 },
  dayPillText: { fontSize: 13, fontWeight: '700', color: colors.brandDark },
  hwRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  hwBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: '#F97316' },
  hwSubject: { fontSize: 14, fontWeight: '800', color: colors.text },
  hwDesc: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  notDone: { backgroundColor: '#DBEAFE', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  notDoneText: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
});
