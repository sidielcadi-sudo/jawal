import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useTeacherState } from '../teacher-state';
import { useNav } from '../navigation';
import { api, ApiError, type TeacherDaySession } from '../api';
import { TeacherHeader } from '../components/TeacherHeader';
import { EmptyCard } from '../components/EmptyCard';
import { colors, subjectColor } from '../theme';

const DAY_MS = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Accueil de l'espace enseignant — même langage visuel que l'accueil parent :
 * une carte d'identité, des indicateurs, puis la journée de cours.
 *
 * La journée passe avant tout le reste : c'est l'écran que le prof ouvre entre
 * deux salles, et chaque cours y porte l'état de son appel.
 */
export default function TeacherHomeScreen() {
  const { token, logout } = useAuth();
  const { me, loading: meLoading } = useTeacherState();
  const { navigate } = useNav();
  const insets = useSafeAreaInsets();

  const [date, setDate] = useState(() => ymd(new Date()));
  const [sessions, setSessions] = useState<TeacherDaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const d = await api.teacherDay(token, date);
      setSessions(d.sessions);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [token, date, logout]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const teacher = me?.teacher;
  const pending = sessions.filter((s) => !s.done).length;

  return (
    <View style={styles.container}>
      <TeacherHeader title="Page d'accueil" />

      {meLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Carte d'accueil : photo, nom, année scolaire. */}
          <View style={styles.hero}>
            {teacher?.photoUrl ? (
              <Image source={{ uri: teacher.photoUrl }} style={styles.heroPhoto} />
            ) : (
              <View style={[styles.heroPhoto, styles.heroPhotoFallback]}>
                <Text style={styles.heroPhotoInitials}>
                  {`${teacher?.firstName[0] ?? ''}${teacher?.lastName[0] ?? ''}`.toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName}>
                {teacher ? `${teacher.firstName} ${teacher.lastName}` : ''}
              </Text>
              <Text style={styles.heroMeta}>{me?.yearLabel ?? ''}</Text>
              <View style={styles.heroActions}>
                <TouchableOpacity
                  style={styles.pillPrimary}
                  onPress={() => navigate({ name: 'teacher', tab: 'appel' })}
                >
                  <Text style={styles.pillPrimaryText}>Appels</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pillGhost}
                  onPress={() => navigate({ name: 'teacher', tab: 'notes' })}
                >
                  <Text style={styles.pillGhostText}>Notes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Indicateurs : ce qui reste à faire aujourd'hui. */}
          <View style={styles.kpiRow}>
            <Kpi
              label="Appels à faire"
              value={String(me?.missingAppels ?? 0)}
              tone={(me?.missingAppels ?? 0) > 0 ? 'danger' : 'ok'}
            />
            <Kpi
              label="Messages non lus"
              value={String(me?.unreadMessages ?? 0)}
              tone={(me?.unreadMessages ?? 0) > 0 ? 'warn' : 'ok'}
            />
            <Kpi label="Mes services" value={String(me?.services.length ?? 0)} tone="ok" />
          </View>

          {/* Emploi du temps du jour */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Emploi du temps</Text>
            {date !== ymd(new Date()) && (
              <TouchableOpacity onPress={() => setDate(ymd(new Date()))}>
                <Text style={styles.seeAll}>Aujourd’hui</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.dayNav}>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setDate(ymd(new Date(new Date(`${date}T00:00:00Z`).getTime() - DAY_MS)))}
              hitSlop={8}
              accessibilityLabel="Jour précédent"
            >
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.dayNavLabel}>{dayLabel(date)}</Text>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setDate(ymd(new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY_MS)))}
              hitSlop={8}
              accessibilityLabel="Jour suivant"
            >
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          </View>

          {pending > 0 && (
            <Text style={styles.pendingHint}>
              {pending} appel{pending > 1 ? 's' : ''} non fait{pending > 1 ? 's' : ''} ce jour.
            </Text>
          )}

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 20 }} />
          ) : sessions.length === 0 ? (
            <EmptyCard text="Aucun cours ce jour." />
          ) : (
            sessions.map((s) => (
              <TouchableOpacity
                key={`${s.entryId}|${s.date}`}
                style={styles.courseRow}
                onPress={() => navigate({ name: 'appel', entryId: s.entryId, date: s.date })}
              >
                <View style={styles.timeCol}>
                  <Text style={styles.timeStart}>{s.slotStart}</Text>
                  <Text style={styles.timeEnd}>{s.slotEnd}</Text>
                </View>
                <View style={[styles.courseBar, { backgroundColor: subjectColor(s.subject) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.courseSubject} numberOfLines={1}>
                    {s.className}
                  </Text>
                  <Text style={styles.courseMeta} numberOfLines={1}>
                    {[s.subject, s.room].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </View>
                <View style={[styles.tag, s.done ? styles.tagDone : styles.tagTodo]}>
                  <Text style={[styles.tagText, s.done ? styles.tagTextDone : styles.tagTextTodo]}>
                    {s.done ? 'Appel fait' : 'À faire'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'danger' }) {
  const color = tone === 'danger' ? colors.danger : tone === 'warn' ? '#D97706' : colors.brand;
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, marginBottom: 8 },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.brand100,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 18,
    marginBottom: 14,
  },
  heroPhoto: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand200 },
  heroPhotoFallback: { alignItems: 'center', justifyContent: 'center' },
  heroPhotoInitials: { fontSize: 24, fontWeight: '900', color: colors.brandDark },
  heroName: { fontSize: 20, fontWeight: '800', color: colors.text },
  heroMeta: { marginTop: 3, fontSize: 13, color: colors.textMuted },
  heroActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pillPrimary: { backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
  pillPrimaryText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  pillGhost: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  pillGhostText: { color: colors.text, fontSize: 12, fontWeight: '600' },

  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  kpi: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brand200,
    paddingVertical: 12,
    alignItems: 'center',
  },
  kpiValue: { fontSize: 24, fontWeight: '900' },
  kpiLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.brandDark },
  seeAll: { fontSize: 12, fontWeight: '700', color: colors.brand },
  pendingHint: { fontSize: 12, color: '#B45309', marginBottom: 8 },

  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brand200,
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginBottom: 10,
  },
  navBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 },
  navBtnText: { fontSize: 22, lineHeight: 24, fontWeight: '800', color: colors.brand },
  dayNavLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '800', color: colors.brandDark, textTransform: 'capitalize' },

  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brand200,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  timeCol: { width: 46, alignItems: 'center' },
  timeStart: { fontSize: 14, fontWeight: '800', color: colors.brandDark },
  timeEnd: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  courseBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.brand },
  courseSubject: { fontSize: 14, fontWeight: '800', color: colors.text },
  courseMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  tagDone: { backgroundColor: '#DCFCE7' },
  tagTodo: { backgroundColor: '#FEE2E2' },
  tagText: { fontSize: 11, fontWeight: '700' },
  tagTextDone: { color: '#15803D' },
  tagTextTodo: { color: '#B91C1C' },
});
