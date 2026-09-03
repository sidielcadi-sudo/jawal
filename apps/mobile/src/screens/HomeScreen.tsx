import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useAppState } from '../app-state';
import { useNav } from '../navigation';
import {
  api,
  ApiError,
  type Announcement,
  type ChildDashboard,
  type Evaluation,
  type Homework,
  type TimetableDay,
  type UpcomingExam,
} from '../api';
import { AppHeader } from '../components/AppHeader';
import { EmptyCard } from '../components/EmptyCard';
import { Donut, MultiDonut, avgColor } from '../components/Donut';
import { colors, subjectColor } from '../theme';

const DAY_MS = 86_400_000;

/** Catégories d'appel et types de carnet, rendus lisibles pour les parents. */
const ABSENCE_LABEL: Record<string, string> = {
  ABSENT: 'Absence',
  ABSENT_JUSTIFIED: 'Absence justifiée',
  ABSENT_UNJUSTIFIED: 'Absence non justifiée',
  LATE: 'Retard',
  EXCUSED: 'Sortie / dispense',
};
const CARNET_LABEL: Record<string, string> = {
  INCIDENT: 'Incident',
  REMARQUE: 'Remarque',
  ENCOURAGEMENT: 'Encouragement',
  INFORMATION: 'Information',
  CONVOCATION: 'Convocation',
  SANCTION: 'Sanction',
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);

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
  const [timetable, setTimetable] = useState<TimetableDay | null>(null);
  const [dash, setDash] = useState<ChildDashboard | null>(null);
  const [notes, setNotes] = useState<Evaluation[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  /** Jour affiché par l'emploi du temps — navigable, comme sur le portail. */
  const [edtDate, setEdtDate] = useState(() => ymd(new Date()));
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
      const [up, cah, d, nt, ann] = await Promise.all([
        api.upcoming(token, childId),
        api.cahier(token, childId),
        api.dashboard(token, childId),
        api.notes(token, childId),
        api.announcements(token),
      ]);
      setExams(up.items);
      setHomeworks(cah.homeworks);
      setDash(d);
      setNotes(nt.evaluations);
      setAnnouncements(ann.items);
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

  // L'emploi du temps se recharge seul quand on change de jour : inutile de
  // refaire tourner les DS et les devoirs, qui ne dépendent pas de la date.
  useEffect(() => {
    let cancelled = false;
    if (!token || !childId) return;
    api
      .timetable(token, childId, edtDate)
      .then((d) => !cancelled && setTimetable(d))
      .catch(() => !cancelled && setTimetable(null));
    return () => {
      cancelled = true;
    };
  }, [token, childId, edtDate]);

  // Devoirs groupés par date d'échéance (les plus proches d'abord).
  const withDue = homeworks.filter((h) => h.dueDate);
  const byDay = new Map<string, Homework[]>();
  for (const h of withDue) {
    const d = h.dueDate!.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), h]);
  }
  const days = [...byDay.keys()].sort();

  // Les 5 notes les plus récentes effectivement saisies.
  const lastNotes = notes
    .filter((n) => n.value !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  // Vie scolaire : absences/retards et entrées de carnet fusionnées sur une
  // seule frise, du plus récent au plus ancien.
  const events = [
    ...(dash?.recentAbsences ?? []).map((a) => ({
      id: a.id,
      at: a.date,
      title: ABSENCE_LABEL[a.cat] ?? a.cat,
      detail: a.className,
      color: a.cat === 'LATE' ? '#D97706' : colors.danger,
    })),
    ...(dash?.recentCarnet ?? []).map((c) => ({
      id: c.id,
      at: c.occurredAt,
      title: CARNET_LABEL[c.type] ?? c.type,
      detail: c.content,
      color: '#7C3AED',
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  const lastAnnouncements = [...announcements]
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, 5);

  return (
    <View style={styles.container}>
      <AppHeader title="Page d'accueil" />

      {meLoading || loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : !selectedChild ? (
        <View style={styles.centered}>
          <EmptyCard text="Aucun enfant rattaché à ce compte." />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Carte d'accueil — reprise du « hero » du portail élève :
              salutation, classe, deux boutons pilule, emblème à droite. */}
          <View style={styles.hero}>
            {dash?.photoUrl ? (
              <Image source={{ uri: dash.photoUrl }} style={styles.heroPhoto} />
            ) : (
              <View style={[styles.heroPhoto, styles.heroPhotoFallback]}>
                <Text style={styles.heroPhotoInitials}>
                  {`${selectedChild.firstName[0] ?? ''}${selectedChild.lastName[0] ?? ''}`.toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.heroHello}>
                {dash?.firstName ?? selectedChild.firstName}
              </Text>
              <Text style={styles.heroClass}>
                {dash?.className ?? selectedChild.className ?? 'Classe non renseignée'}
              </Text>
              <View style={styles.heroActions}>
                <TouchableOpacity
                  style={styles.pillPrimary}
                  onPress={() => navigate({ name: 'child', tab: 'notes' })}
                >
                  <Text style={styles.pillPrimaryText}>Notes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pillGhost}
                  onPress={() => navigate({ name: 'child', tab: 'cahier' })}
                >
                  <Text style={styles.pillGhostText}>Cahier</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Progression — anneaux identiques à ceux du portail élève. */}
          {dash && (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Progression</Text>
              <View style={styles.donutGrid}>
                <Donut
                  pct={dash.generalAverage === null ? 0 : (dash.generalAverage / 20) * 100}
                  color={avgColor(dash.generalAverage)}
                  center={dash.generalAverage === null ? '—' : dash.generalAverage.toFixed(1)}
                  label="Moyenne générale"
                />
                <Donut
                  pct={dash.attendanceRate ?? 0}
                  color={
                    dash.attendanceRate === null
                      ? '#CBD5E1'
                      : dash.attendanceRate < 90
                        ? '#D97706'
                        : '#059669'
                  }
                  center={
                    dash.attendanceRate === null ? '—' : `${Math.round(dash.attendanceRate)}%`
                  }
                  label="Taux de présence"
                />
                {dash.subjects
                  .filter((s) => s.avg !== null)
                  .map((s) => (
                    <MultiDonut
                      key={s.label}
                      values={s.byPeriod.length ? s.byPeriod : [s.avg]}
                      center={s.avg!.toFixed(1)}
                      label={s.label}
                    />
                  ))}
              </View>
              {dash.periods.length > 1 && (
                <Text style={styles.ringLegend}>
                  Anneaux de l’extérieur vers l’intérieur :{' '}
                  {dash.periods.map((p) => p.label).join(' · ')}
                </Text>
              )}
            </View>
          )}

          {/* Emploi du temps du jour — même contenu que l'onglet
              « Aujourd'hui » du portail parent : créneau, matière, professeur,
              salle, et les annulations / remplacements approuvés. */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Emploi du temps</Text>
            {edtDate !== ymd(new Date()) && (
              <TouchableOpacity onPress={() => setEdtDate(ymd(new Date()))}>
                <Text style={styles.seeAll}>Aujourd’hui</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Navigation par jour, comme l'onglet « Aujourd'hui » du portail. */}
          <View style={styles.dayNav}>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setEdtDate(ymd(new Date(new Date(`${edtDate}T00:00:00Z`).getTime() - DAY_MS)))}
              hitSlop={8}
              accessibilityLabel="Jour précédent"
            >
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.dayNavLabel}>{dayLabel(edtDate)}</Text>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setEdtDate(ymd(new Date(new Date(`${edtDate}T00:00:00Z`).getTime() + DAY_MS)))}
              hitSlop={8}
              accessibilityLabel="Jour suivant"
            >
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          </View>

          {!timetable || timetable.courses.length === 0 ? (
            <EmptyCard text="Aucun cours prévu ce jour." />
          ) : (
            timetable.courses.map((c) => (
              <View
                key={c.id}
                style={[styles.courseRow, c.cancelled && styles.courseRowCancelled]}
              >
                <View style={styles.timeCol}>
                  <Text style={styles.timeStart}>{c.startTime}</Text>
                  <Text style={styles.timeEnd}>{c.endTime}</Text>
                </View>
                {/* Barre colorée par matière : une matière garde sa couleur
                    d'un jour à l'autre, ce qui rend la journée lisible d'un
                    coup d'œil. Rouge si annulé, gris si pause. */}
                <View
                  style={[
                    styles.courseBar,
                    { backgroundColor: subjectColor(c.subject) },
                    c.isBreak && { backgroundColor: '#CBD5E1' },
                    c.cancelled && { backgroundColor: colors.danger },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.courseSubject, c.cancelled && styles.strikethrough]}
                    numberOfLines={1}
                  >
                    {c.isBreak ? 'Pause' : (c.subject ?? '—')}
                  </Text>
                  {!c.isBreak && (
                    <Text style={styles.courseMeta} numberOfLines={1}>
                      {[c.substituteName ?? c.teacher, c.room].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  )}
                  {c.cancelled && <Text style={styles.tagCancelled}>Cours annulé</Text>}
                  {!c.cancelled && c.substituteName && (
                    <Text style={styles.tagSubstitute}>Remplacement</Text>
                  )}
                </View>
              </View>
            ))
          )}

          {/* Prochains DS */}
          <View style={{ height: 22 }} />
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Prochains DS</Text>
            <TouchableOpacity onPress={() => navigate({ name: 'child', tab: 'notes' })}>
              <Text style={styles.seeAll}>Tout voir ↗</Text>
            </TouchableOpacity>
          </View>
          {exams.length === 0 ? (
            <EmptyCard text="Aucun contrôle programmé." />
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
            <EmptyCard text="Aucun devoir à venir." />
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
          {/* Dernières notes reçues */}
          <View style={[styles.sectionHead, { marginTop: 22 }]}>
            <Text style={styles.sectionTitle}>Dernières notes reçues</Text>
            <TouchableOpacity onPress={() => navigate({ name: 'child', tab: 'notes' })}>
              <Text style={styles.seeAll}>Tout voir ↗</Text>
            </TouchableOpacity>
          </View>
          {lastNotes.length === 0 ? (
            <EmptyCard text="Aucune note pour le moment." />
          ) : (
            lastNotes.map((n) => (
              <View key={n.id} style={styles.hwRow}>
                <View style={[styles.hwBar, { backgroundColor: subjectColor(n.subject) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hwSubject}>{n.subject.toUpperCase()}</Text>
                  <Text style={styles.hwDesc} numberOfLines={1}>
                    {n.label} · {dayLabel(n.date.slice(0, 10))}
                  </Text>
                </View>
                <Text style={[styles.noteValue, { color: avgColor((n.value! / n.maxValue) * 20) }]}>
                  {n.value}
                  <Text style={styles.noteMax}>/{n.maxValue}</Text>
                </Text>
              </View>
            ))
          )}

          {/* Absences / retards / incidents */}
          <View style={[styles.sectionHead, { marginTop: 22 }]}>
            <Text style={styles.sectionTitle}>Absences / retards / incidents</Text>
            <TouchableOpacity onPress={() => navigate({ name: 'child', tab: 'vie' })}>
              <Text style={styles.seeAll}>Tout voir ↗</Text>
            </TouchableOpacity>
          </View>
          {events.length === 0 ? (
            <EmptyCard text="Aucun événement de vie scolaire." />
          ) : (
            events.map((e) => (
              <View key={e.id} style={styles.hwRow}>
                <View style={[styles.hwBar, { backgroundColor: e.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hwSubject}>{e.title}</Text>
                  <Text style={styles.hwDesc} numberOfLines={2}>
                    {e.detail}
                  </Text>
                </View>
                <Text style={styles.eventDate}>{dayLabel(e.at.slice(0, 10))}</Text>
              </View>
            ))
          )}

          {/* Dernières annonces */}
          <View style={[styles.sectionHead, { marginTop: 22 }]}>
            <Text style={styles.sectionTitle}>Dernières annonces</Text>
            <TouchableOpacity onPress={() => navigate({ name: 'announcements' })}>
              <Text style={styles.seeAll}>Tout voir ↗</Text>
            </TouchableOpacity>
          </View>
          {lastAnnouncements.length === 0 ? (
            <EmptyCard text="Aucune annonce." />
          ) : (
            lastAnnouncements.map((a) => (
              <View key={a.id} style={styles.hwRow}>
                <View style={[styles.hwBar, { backgroundColor: colors.brand }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hwSubject}>{a.title}</Text>
                  <Text style={styles.hwDesc} numberOfLines={2}>
                    {a.body}
                  </Text>
                </View>
                {a.publishedAt && (
                  <Text style={styles.eventDate}>{dayLabel(a.publishedAt.slice(0, 10))}</Text>
                )}
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
    borderColor: colors.brand200,
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

  /* ── Carte d'accueil et progression (langage du portail élève) ───────── */
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.brand100,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 18,
    marginBottom: 14,
  },
  heroHello: { fontSize: 21, fontWeight: '800', color: colors.text },
  heroClass: { marginTop: 3, fontSize: 13, color: colors.textMuted },
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
  heroPhoto: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand200 },
  heroPhotoFallback: { alignItems: 'center', justifyContent: 'center' },
  heroPhotoInitials: { fontSize: 24, fontWeight: '900', color: colors.brandDark },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 18,
    marginBottom: 18,
  },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 14 },
  ringLegend: { marginTop: 14, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  noteValue: { fontSize: 16, fontWeight: '900' },
  noteMax: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  eventDate: { fontSize: 11, color: colors.textMuted },
  donutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' },

  /* ── Emploi du temps du jour ─────────────────────────────────────────── */
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
  todayLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'capitalize' },
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
  courseRowCancelled: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  timeCol: { width: 46, alignItems: 'center' },
  timeStart: { fontSize: 14, fontWeight: '800', color: colors.brandDark },
  timeEnd: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  courseBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.brand },
  courseSubject: { fontSize: 14, fontWeight: '800', color: colors.text },
  strikethrough: { textDecorationLine: 'line-through', color: '#B91C1C' },
  courseMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tagCancelled: { marginTop: 3, fontSize: 11, fontWeight: '700', color: '#B91C1C' },
  tagSubstitute: { marginTop: 3, fontSize: 11, fontWeight: '700', color: '#C2410C' },
});
