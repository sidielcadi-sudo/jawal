import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../components/AppHeader';
import { PaymentWebView } from '../components/PaymentWebView';
import { useAuth } from '../auth';
import { useAppState } from '../app-state';
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
  type SupportCourse,
  type CompetencyDomain,
} from '../api';
import { colors } from '../theme';

type Tab = 'notes' | 'cahier' | 'vie' | 'competences' | 'soutien' | 'scolarite';
const TABS: { key: Tab; label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'cahier', label: 'Cahier' },
  { key: 'vie', label: 'Vie sco.' },
  { key: 'competences', label: 'Compétences' },
  { key: 'soutien', label: 'Soutien' },
  { key: 'scolarite', label: 'Scolarité' },
];

/** Couleur d'un taux d'acquisition — alignée sur l'échelle NA → M du web. */
function rateColor(rate: number | null): string {
  if (rate === null) return '#cbd5e1';
  if (rate < 33) return '#ef4444';
  if (rate < 55) return '#f97316';
  if (rate < 80) return '#10b981';
  return '#059669';
}

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

export default function ChildDetailScreen({ initialTab }: { initialTab?: Tab }) {
  const { selectedChild } = useAppState();
  const [tab, setTab] = useState<Tab>(initialTab ?? 'notes');

  const childId = selectedChild?.id ?? null;
  const title = selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : 'Suivi scolaire';

  if (!childId) {
    return (
      <View style={styles.container}>
        <AppHeader title={title} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.empty}>Aucun enfant sélectionné.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title={title} />
      {/* Barre défilable : 6 onglets ne tiennent pas sur la largeur d'un mobile. */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {tab === 'notes' && <NotesTab childId={childId} />}
      {tab === 'cahier' && <CahierTab childId={childId} />}
      {tab === 'vie' && <VieTab childId={childId} />}
      {tab === 'competences' && <CompetencesTab childId={childId} />}
      {tab === 'soutien' && <SoutienTab childId={childId} />}
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

// ── Compétences & aptitudes (APC) ───────────────────────────────────────────
function CompetencesTab({ childId }: { childId: string }) {
  const { token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { data, loading, error, reload } = useLoad(() => api.competences(token!, childId), logout, [childId, token]);
  if (loading) return <Loader />;

  if (!data || !data.available) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Empty text={error || 'Aucune évaluation de compétences pour le moment.'} />
      </ScrollView>
    );
  }

  const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r)}%`);
  const section = (kind: 'DISCIPLINARY' | 'TRANSVERSAL', title: string) => {
    // Domaines ayant des lignes de ce type (Compétence ou Aptitude).
    const domains = data.domains
      .map((d: CompetencyDomain) => ({ id: d.id, label: d.label, comps: d.competencies.filter((c) => c.kind === kind) }))
      .filter((d) => d.comps.length > 0);
    if (domains.length === 0) return null;
    return (
      <View key={kind} style={{ marginTop: 16 }}>
        <Text style={styles.section}>{title}</Text>
        {domains.map((d) => {
          const rates = d.comps.filter((c) => c.rate !== null).map((c) => c.rate as number);
          const domRate = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null;
          return (
            <View key={d.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.subject}>{d.label}</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: rateColor(domRate) }}>{pct(domRate)}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${domRate ?? 0}%`, backgroundColor: rateColor(domRate) }]} />
              </View>
              {d.comps.map((c) => (
                <View key={c.id} style={styles.compRow}>
                  <Text style={styles.compName} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[styles.compVal, { color: rateColor(c.rate) }]}>{pct(c.rate)}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.brand} />}
    >
      {/* Bandeau : période, taux globaux, couverture */}
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.subject}>{data.periodLabel}</Text>
          {data.provisional && (
            <View style={styles.provBadge}>
              <Text style={styles.provText}>Provisoire</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          {[
            ['Compétences', data.disciplinaryRate],
            ['Aptitudes', data.transversalRate],
          ].map(([label, rate]) => (
            <View key={label as string} style={styles.rateBox}>
              <Text style={styles.rateLabel}>{label as string}</Text>
              <Text style={[styles.rateValue, { color: rateColor(rate as number | null) }]}>
                {pct(rate as number | null)}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.meta}>
          {data.covered}/{data.total} items évalués
        </Text>
        {/* Légende de l'échelle — indispensable pour un parent */}
        <View style={styles.legend}>
          {data.scale.map((m) => (
            <View key={m.code} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: m.color }]} />
              <Text style={styles.legendText}>{m.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {section('DISCIPLINARY', 'Compétences')}
      {section('TRANSVERSAL', 'Aptitudes')}
    </ScrollView>
  );
}

// ── Soutien scolaire (séances : date, heure, prof, présence, ressources) ─────
function SoutienTab({ childId }: { childId: string }) {
  const { token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { data, loading, error, reload } = useLoad(() => api.soutien(token!, childId), logout, [childId, token]);
  if (loading) return <Loader />;
  const courses: SupportCourse[] = data?.courses ?? [];
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.brand} />}
    >
      {courses.length === 0 ? (
        <Empty text={error || 'Aucun cours de soutien.'} />
      ) : (
        courses.map((c, ci) => (
          <View key={ci} style={{ marginBottom: 18 }}>
            <Text style={styles.section}>📚 {c.courseTitle}</Text>
            <Text style={[styles.meta, { marginTop: -4, marginBottom: 8 }]}>
              {c.subject}
              {c.teacher ? ` · 👩‍🏫 ${c.teacher}` : ''}
            </Text>
            {c.sessions.length === 0 ? (
              <Empty text="Aucune séance." />
            ) : (
              c.sessions.map((se, si) => (
                <View key={si} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.subject}>
                      {new Date(`${se.date}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })}
                      {se.time ? `  🕒 ${se.time}` : ''}
                    </Text>
                    {se.present === null ? (
                      <Text style={styles.badge}>—</Text>
                    ) : (
                      <View style={[styles.presBadge, { backgroundColor: se.present ? '#D1FAE5' : '#FEE2E2' }]}>
                        <Text style={[styles.presText, { color: se.present ? '#047857' : '#B91C1C' }]}>
                          {se.present ? 'Présent' : 'Absent'}
                        </Text>
                      </View>
                    )}
                  </View>
                  {se.topic ? <Text style={styles.body}>{se.topic}</Text> : null}
                  {se.appreciation ? <Text style={styles.meta}>Appréciation : {se.appreciation}</Text> : null}
                  {se.resources.length > 0 && (
                    <View style={styles.resWrap}>
                      {se.resources.map((r) => (
                        <TouchableOpacity key={r.id} style={styles.resChip} onPress={() => Linking.openURL(r.url)}>
                          <Text style={styles.resChipText}>🔗 {r.title}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ))
            )}
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
  tabsWrap: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabs: { flexDirection: 'row', paddingHorizontal: 4 },
  tab: { paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
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
  presBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  presText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  resWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  resChip: { borderRadius: 8, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 4 },
  resChipText: { fontSize: 12, color: colors.brand, fontWeight: '600' },
  // Compétences
  provBadge: { borderRadius: 6, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3 },
  provText: { fontSize: 10, fontWeight: '800', color: '#B45309', textTransform: 'uppercase' },
  rateBox: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: 'center' },
  rateLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  rateValue: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 3 },
  compRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  compName: { flex: 1, fontSize: 12, color: colors.textMuted, marginRight: 8 },
  compVal: { fontSize: 12, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.textMuted },
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
