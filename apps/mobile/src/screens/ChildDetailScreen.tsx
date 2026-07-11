import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { PaymentWebView } from '../components/PaymentWebView';
import { useAuth } from '../auth';
import { useNav } from '../navigation';
import {
  api,
  ApiError,
  type Evaluation,
  type Lesson,
  type Homework,
  type CarnetEntry,
  type CarnetEvent,
  type Fee,
  type PayInit,
} from '../api';
import { colors } from '../theme';

type Tab = 'notes' | 'cahier' | 'vie' | 'scolarite';
const TABS: { key: Tab; label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'cahier', label: 'Cahier' },
  { key: 'vie', label: 'Vie sco.' },
  { key: 'scolarite', label: 'Scolarité' },
];

/** Petit hook de chargement générique (data / loading / error / reload). */
function useLoad<T>(fetcher: () => Promise<T>, onUnauthorized: () => void, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setError('');
    try {
      setData(await fetcher());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, error, reload };
}

export default function ChildDetailScreen({ childId, childName }: { childId: string; childName: string }) {
  const { goBack } = useNav();
  const [tab, setTab] = useState<Tab>('notes');

  return (
    <View style={styles.container}>
      <Header title={childName} subtitle="Suivi scolaire" onBack={goBack} />
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'notes' && <NotesTab childId={childId} />}
      {tab === 'cahier' && <CahierTab childId={childId} />}
      {tab === 'vie' && <VieTab childId={childId} />}
      {tab === 'scolarite' && <ScolariteTab childId={childId} />}
    </View>
  );
}

function Loader() {
  return <ActivityIndicator color={colors.brand} size="large" style={{ marginTop: 40 }} />;
}
function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

// ── Notes ───────────────────────────────────────────────────────────────────
function NotesTab({ childId }: { childId: string }) {
  const { token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { data, loading, error, reload } = useLoad(() => api.notes(token!, childId), logout, [childId, token]);
  if (loading) return <Loader />;
  const evals: Evaluation[] = data?.evaluations ?? [];
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.brand} />}
    >
      {evals.length === 0 ? (
        <Empty text={error || 'Aucune note pour cette période.'} />
      ) : (
        evals.map((e) => (
          <View key={e.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.subject}>{e.subject}</Text>
              <Text style={styles.grade}>
                {e.value != null ? e.value : '—'}
                <Text style={styles.gradeMax}> / {e.maxValue}</Text>
              </Text>
            </View>
            <Text style={styles.meta}>
              {e.label} · coeff {e.coefficient} · {new Date(e.date).toLocaleDateString('fr-FR')}
              {e.classAverage != null ? ` · moy. classe ${e.classAverage}` : ''}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ── Cahier de texte ─────────────────────────────────────────────────────────
function CahierTab({ childId }: { childId: string }) {
  const { token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { data, loading, error, reload } = useLoad(() => api.cahier(token!, childId), logout, [childId, token]);
  if (loading) return <Loader />;
  const lessons: Lesson[] = data?.lessons ?? [];
  const homeworks: Homework[] = data?.homeworks ?? [];
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.brand} />}
    >
      <Text style={styles.section}>Devoirs à venir</Text>
      {homeworks.length === 0 ? (
        <Empty text="Aucun devoir à venir." />
      ) : (
        homeworks.map((h) => (
          <View key={h.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.subject}>{h.subject ?? '—'}</Text>
              {h.dueDate ? <Text style={styles.badge}>{new Date(h.dueDate).toLocaleDateString('fr-FR')}</Text> : null}
            </View>
            <Text style={styles.body}>{h.description}</Text>
          </View>
        ))
      )}

      <Text style={[styles.section, { marginTop: 16 }]}>Leçons récentes</Text>
      {lessons.length === 0 ? (
        <Empty text={error || 'Aucune leçon récente.'} />
      ) : (
        lessons.map((l) => (
          <View key={l.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.subject}>{l.subject ?? '—'}</Text>
              <Text style={styles.badge}>{new Date(l.date).toLocaleDateString('fr-FR')}</Text>
            </View>
            <Text style={styles.lessonTitle}>{l.title}</Text>
            {l.summary ? <Text style={styles.body}>{l.summary}</Text> : null}
            {l.teacher ? <Text style={styles.meta}>{l.teacher}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ── Vie scolaire (absences / incidents) ─────────────────────────────────────
const CATEGORY_LABEL: Record<string, string> = {
  ABSENT: 'Absence',
  LATE: 'Retard',
  EXCLUSION: 'Exclusion',
  PRESENT: 'Présent',
};
function VieTab({ childId }: { childId: string }) {
  const { token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { data, loading, error, reload } = useLoad(() => api.vieScolaire(token!, childId), logout, [childId, token]);
  if (loading) return <Loader />;
  const events: CarnetEvent[] = data?.carnet.events ?? [];
  const entries: CarnetEntry[] = data?.carnet.entries ?? [];
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.brand} />}
    >
      <Text style={styles.section}>Absences & retards</Text>
      {events.length === 0 ? (
        <Empty text="Aucune absence ni retard." />
      ) : (
        events.map((ev) => (
          <View key={ev.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.subject}>{CATEGORY_LABEL[ev.category] ?? ev.category}</Text>
              <Text style={styles.badge}>{new Date(ev.date).toLocaleDateString('fr-FR')}</Text>
            </View>
            <Text style={styles.meta}>
              {ev.className}
              {ev.justifStatus ? ` · justif. ${ev.justifStatus === 'APPROVED' ? 'acceptée' : ev.justifStatus === 'REJECTED' ? 'refusée' : 'en attente'}` : ' · non justifiée'}
            </Text>
          </View>
        ))
      )}

      <Text style={[styles.section, { marginTop: 16 }]}>Observations</Text>
      {entries.length === 0 ? (
        <Empty text={error || 'Aucune observation.'} />
      ) : (
        entries.map((en) => (
          <View key={en.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.subject}>{en.type}</Text>
              <Text style={styles.badge}>{new Date(en.occurredAt).toLocaleDateString('fr-FR')}</Text>
            </View>
            <Text style={styles.body}>{en.content}</Text>
            <Text style={styles.meta}>
              {en.authorName}
              {en.subjectLabel ? ` · ${en.subjectLabel}` : ''}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ── Scolarité (échéancier + paiement en ligne) ──────────────────────────────
const FEE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'À payer', color: '#B45309', bg: '#FEF3C7' },
  PARTIAL: { label: 'Partiel', color: '#1D4ED8', bg: '#DBEAFE' },
  PAID: { label: 'Payé', color: '#047857', bg: '#D1FAE5' },
};
function ScolariteTab({ childId }: { childId: string }) {
  const { token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { data, loading, error, reload } = useLoad(() => api.scolarite(token!, childId), logout, [childId, token]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pay, setPay] = useState<PayInit | null>(null);
  const [initiating, setInitiating] = useState(false);

  const fees: Fee[] = data?.fees ?? [];
  const payable = fees.filter((f) => f.remaining > 0);
  const selectedTotal = payable.filter((f) => selected.has(f.id)).reduce((s, f) => s + f.remaining, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onPay = async () => {
    if (!token || selected.size === 0) return;
    if (!data?.paymentConfigured) {
      return Alert.alert('Bientôt disponible', 'Le paiement en ligne n’est pas encore activé pour votre établissement.');
    }
    setInitiating(true);
    try {
      const init = await api.initPayment(token, childId, [...selected]);
      setPay(init);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      Alert.alert('Erreur', e instanceof ApiError ? e.message : 'Paiement impossible.');
    } finally {
      setInitiating(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.brand} />}
      >
        {data && (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Reste à payer</Text>
            <Text style={[styles.totalValue, { color: data.totalRemaining > 0 ? '#B45309' : '#047857' }]}>
              {data.totalRemaining.toLocaleString('fr-FR')} {data.currency}
            </Text>
            <Text style={styles.totalSub}>
              Payé {data.totalPaid.toLocaleString('fr-FR')} / {data.totalDue.toLocaleString('fr-FR')} {data.currency}
            </Text>
          </View>
        )}

        {fees.length === 0 ? (
          <Empty text={error || 'Aucune échéance.'} />
        ) : (
          fees.map((f) => {
            const st = FEE_STATUS[f.status];
            const selectable = f.remaining > 0;
            const on = selected.has(f.id);
            return (
              <TouchableOpacity
                key={f.id}
                activeOpacity={selectable ? 0.7 : 1}
                onPress={() => selectable && toggle(f.id)}
                style={styles.card}
              >
                <View style={styles.row}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    {selectable ? (
                      <View style={[styles.checkbox, on && styles.checkboxOn]}>
                        {on ? <Text style={styles.checkboxTick}>✓</Text> : null}
                      </View>
                    ) : null}
                    <Text style={styles.subject}>{f.label}</Text>
                  </View>
                  <View style={[styles.feeBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.feeBadgeText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  Échéance {new Date(f.dueDate).toLocaleDateString('fr-FR')} · {f.amount.toLocaleString('fr-FR')} MAD
                  {f.remaining > 0 && f.remaining !== f.amount ? ` · reste ${f.remaining.toLocaleString('fr-FR')}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {payable.length > 0 && (
        <View style={[styles.payBar, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            style={[styles.payBtn, (selected.size === 0 || initiating) && { opacity: 0.5 }]}
            onPress={onPay}
            disabled={selected.size === 0 || initiating}
          >
            <Text style={styles.payBtnText}>
              {initiating
                ? 'Ouverture…'
                : selected.size === 0
                ? 'Sélectionnez une échéance'
                : `Payer ${selectedTotal.toLocaleString('fr-FR')} MAD`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {pay && token && (
        <PaymentWebView
          init={pay}
          token={token}
          onClose={(paid) => {
            setPay(null);
            if (paid) {
              setSelected(new Set());
              reload();
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.brand },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.brand },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subject: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  grade: { fontSize: 18, fontWeight: '800', color: colors.brand },
  gradeMax: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  badge: { fontSize: 12, color: colors.textMuted, marginLeft: 8 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  body: { fontSize: 14, color: colors.text, marginTop: 6, lineHeight: 20 },
  lessonTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 4 },
  totalCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 14,
    alignItems: 'center',
  },
  totalLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  totalValue: { fontSize: 28, fontWeight: '900', marginTop: 4 },
  totalSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkboxTick: { color: colors.white, fontSize: 13, fontWeight: '900' },
  feeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  feeBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  payBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  payBtn: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  payBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
