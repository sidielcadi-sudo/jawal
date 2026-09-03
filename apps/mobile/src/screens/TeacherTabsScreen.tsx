import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useTeacherState } from '../teacher-state';
import { useNav, type TeacherTab } from '../navigation';
import { api, ApiError, type LeaveRequestItem, type TeacherDaySession } from '../api';
import { TeacherHeader } from '../components/TeacherHeader';
import { EmptyCard } from '../components/EmptyCard';
import { colors, subjectColor } from '../theme';

const TABS: { key: TeacherTab; label: string }[] = [
  { key: 'appel', label: 'Appel' },
  { key: 'notes', label: 'Notes' },
  { key: 'leave', label: 'Congés' },
];

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Écran à onglets de l'espace enseignant — pendant de la fiche enfant côté parent. */
export default function TeacherTabsScreen({ initialTab }: { initialTab: TeacherTab }) {
  const [tab, setTab] = useState<TeacherTab>(initialTab);

  return (
    <View style={styles.container}>
      <TeacherHeader title="Mon espace" />
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'appel' && <AppelTab />}
      {tab === 'notes' && <NotesTab />}
      {tab === 'leave' && <LeaveTab />}
    </View>
  );
}

/** Onglet Appel : les séances du jour, avec leur état. */
function AppelTab() {
  const { token, logout } = useAuth();
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

  const shift = (n: number) =>
    setDate(ymd(new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86_400_000)));

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.dayNav}>
        <TouchableOpacity style={styles.navBtn} onPress={() => shift(-1)} hitSlop={8}>
          <Text style={styles.navBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.dayNavLabel}>
          {new Date(`${date}T00:00:00Z`).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          })}
        </Text>
        <TouchableOpacity style={styles.navBtn} onPress={() => shift(1)} hitSlop={8}>
          <Text style={styles.navBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 20 }} />
      ) : sessions.length === 0 ? (
        <EmptyCard text="Aucun cours ce jour." />
      ) : (
        sessions.map((s) => (
          <TouchableOpacity
            key={`${s.entryId}|${s.date}`}
            style={styles.row}
            onPress={() => navigate({ name: 'appel', entryId: s.entryId, date: s.date })}
          >
            <View style={styles.timeCol}>
              <Text style={styles.timeStart}>{s.slotStart}</Text>
              <Text style={styles.timeEnd}>{s.slotEnd}</Text>
            </View>
            <View style={[styles.bar, { backgroundColor: subjectColor(s.subject) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.className}</Text>
              <Text style={styles.rowMeta}>{[s.subject, s.room].filter(Boolean).join(' · ') || '—'}</Text>
            </View>
            <View style={[styles.tag, s.done ? styles.tagDone : styles.tagTodo]}>
              <Text style={[styles.tagText, s.done ? styles.tagTextDone : styles.tagTextTodo]}>
                {s.done ? 'Fait' : 'À faire'}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

/** Onglet Notes : la liste des services, chacun ouvrant sa grille de saisie. */
function NotesTab() {
  const { me, loading } = useTeacherState();
  const { navigate } = useNav();
  const insets = useSafeAreaInsets();

  if (loading) return <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
      {(me?.services.length ?? 0) === 0 ? (
        <EmptyCard text="Aucune classe ne vous est affectée." />
      ) : (
        me!.services.map((s) => (
          <TouchableOpacity
            key={`${s.classId}|${s.subjectId}`}
            style={styles.row}
            onPress={() =>
              navigate({
                name: 'teacherNotes',
                classId: s.classId,
                subjectId: s.subjectId,
                title: `${s.className} · ${s.subjectLabel}`,
              })
            }
          >
            <View style={[styles.bar, { backgroundColor: subjectColor(s.subjectLabel) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.className}</Text>
              <Text style={styles.rowMeta}>{s.subjectLabel}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const STATUS_LABEL: Record<LeaveRequestItem['status'], { label: string; color: string; bg: string }> = {
  PENDING: { label: 'En attente', color: '#B45309', bg: '#FEF3C7' },
  APPROVED: { label: 'Approuvée', color: '#15803D', bg: '#DCFCE7' },
  REJECTED: { label: 'Refusée', color: '#B91C1C', bg: '#FEE2E2' },
  CANCELLED: { label: 'Annulée', color: '#475569', bg: '#E2E8F0' },
};

/** Onglet Congés : mes demandes, et le formulaire d'auto-déclaration. */
function LeaveTab() {
  const { token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ types: { id: string; label: string }[]; requests: LeaveRequestItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [start, setStart] = useState(ymd(new Date()));
  const [end, setEnd] = useState(ymd(new Date()));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const d = await api.teacherLeave(token);
      setData(d);
      setTypeId((cur) => cur || d.types[0]?.id || '');
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

  const submit = async () => {
    if (!token || !typeId) return;
    setSaving(true);
    setError('');
    try {
      await api.createLeave(token, { leaveTypeId: typeId, startDate: start, endDate: end, reason: reason || undefined });
      Alert.alert('Demande envoyée', 'La vie scolaire et la direction ont été prévenues.');
      setForm(false);
      setReason('');
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {form ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Déclarer une absence</Text>

          <Text style={styles.fieldLabel}>Motif</Text>
          <View style={styles.chipWrap}>
            {data?.types.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.chip, typeId === t.id && styles.chipOn]}
                onPress={() => setTypeId(t.id)}
              >
                <Text style={[styles.chipText, typeId === t.id && styles.chipTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Du (AAAA-MM-JJ)</Text>
          <TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="2026-09-10" />
          <Text style={styles.fieldLabel}>Au (AAAA-MM-JJ)</Text>
          <TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="2026-09-12" />
          <Text style={styles.fieldLabel}>Précisions (facultatif)</Text>
          <TextInput
            style={[styles.input, { height: 80 }]}
            value={reason}
            onChangeText={setReason}
            multiline
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={styles.btnGhost} onPress={() => setForm(false)}>
              <Text style={styles.btnGhostText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, saving && { opacity: 0.6 }]} disabled={saving} onPress={submit}>
              <Text style={styles.btnPrimaryText}>{saving ? '…' : 'Envoyer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.btnPrimary} onPress={() => setForm(true)}>
          <Text style={styles.btnPrimaryText}>Déclarer une absence</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 16 }} />

      {(data?.requests.length ?? 0) === 0 ? (
        <EmptyCard text="Aucune demande." />
      ) : (
        data!.requests.map((r) => {
          const st = STATUS_LABEL[r.status];
          return (
            <View key={r.id} style={styles.leaveRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.typeLabel}</Text>
                <Text style={styles.rowMeta}>
                  {r.startDate} → {r.endDate} · {r.days} j
                </Text>
                {r.decisionComment ? <Text style={styles.rowMeta}>{r.decisionComment}</Text> : null}
              </View>
              <View style={[styles.tag, { backgroundColor: st.bg }]}>
                <Text style={[styles.tagText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  error: { color: colors.danger, marginBottom: 8 },

  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.brand },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.brand },

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
    marginBottom: 12,
  },
  navBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 },
  navBtnText: { fontSize: 22, lineHeight: 24, fontWeight: '800', color: colors.brand },
  dayNavLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '800', color: colors.brandDark, textTransform: 'capitalize' },

  row: {
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
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  timeCol: { width: 46, alignItems: 'center' },
  timeStart: { fontSize: 14, fontWeight: '800', color: colors.brandDark },
  timeEnd: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.brand },
  rowTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textMuted },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  tagDone: { backgroundColor: '#DCFCE7' },
  tagTodo: { backgroundColor: '#FEE2E2' },
  tagText: { fontSize: 11, fontWeight: '700' },
  tagTextDone: { color: '#15803D' },
  tagTextTodo: { color: '#B91C1C' },

  formCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 14,
  },
  formTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTextOn: { color: colors.white },

  btnGhost: { flex: 1, borderWidth: 1, borderColor: colors.brand, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnGhostText: { color: colors.brand, fontWeight: '700' },
  btnPrimary: { flex: 1, backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryText: { color: colors.white, fontWeight: '800' },
});
