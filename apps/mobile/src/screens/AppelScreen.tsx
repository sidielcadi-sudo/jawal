import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useNav } from '../navigation';
import { api, ApiError, type AppelSheet, type AppelStudentRow } from '../api';
import { TeacherHeader } from '../components/TeacherHeader';
import { colors } from '../theme';

/**
 * Catégorie « vie scolaire » unique d'un élève sur la séance — même découpage
 * que le portail (`lib/attendance-category`). Un élève n'en porte qu'une.
 */
type Category = 'PRESENT' | 'ABSENT' | 'LATE' | 'PUNISHMENT' | 'EXCLUSION' | 'EXCUSED';

type Marks = Pick<AppelStudentRow, 'status' | 'infirmary' | 'punishment' | 'exclusion'>;

// Infirmerie/Punition restent « présents » (status PRESENT) ; Exclusion compte
// comme absence (status ABSENT). Identique au portail.
const CAT_TO_STATE: Record<Category, Marks> = {
  PRESENT: { status: 'PRESENT', infirmary: false, punishment: false, exclusion: false },
  ABSENT: { status: 'ABSENT', infirmary: false, punishment: false, exclusion: false },
  LATE: { status: 'LATE', infirmary: false, punishment: false, exclusion: false },
  EXCUSED: { status: 'EXCUSED', infirmary: false, punishment: false, exclusion: false },
  PUNISHMENT: { status: 'PRESENT', infirmary: false, punishment: true, exclusion: false },
  EXCLUSION: { status: 'ABSENT', infirmary: false, punishment: false, exclusion: true },
};

function categoryOf(r: AppelStudentRow): Category {
  if (r.exclusion) return 'EXCLUSION';
  if (r.punishment) return 'PUNISHMENT';
  if (r.status === 'ABSENT') return 'ABSENT';
  if (r.status === 'LATE') return 'LATE';
  if (r.status === 'EXCUSED') return 'EXCUSED';
  return 'PRESENT';
}

/**
 * Colonnes de la feuille, dans l'ordre du portail. Infirmerie, Punition et
 * Exclusion masquées : ce ne sont pas des absences (les exclusions passent par
 * le carnet de correspondance).
 */
const COLS: { cat: Exclude<Category, 'PRESENT'>; label: string; color: string }[] = [
  { cat: 'ABSENT', label: 'Absence', color: '#DC2626' },
  { cat: 'LATE', label: 'Retard', color: '#D97706' },
  { cat: 'EXCUSED', label: 'Dispense', color: '#16A34A' },
];

/**
 * Feuille d'appel d'une séance — reprise fidèle de celle du portail
 * enseignant : mêmes catégories exclusives, même bande de synthèse, mêmes
 * motifs de retard et même saisie d'observations aux parents. Un prof qui
 * bascule du téléphone à l'ordinateur retrouve exactement le même écran.
 *
 * Tous les élèves sont présents par défaut : on ne pointe que les exceptions.
 * L'appel n'est verrouillé qu'à la validation ; avant cela on enregistre un
 * brouillon, et après on peut déverrouiller.
 */
export default function AppelScreen({ entryId, date }: { entryId: string; date: string }) {
  const { token, logout } = useAuth();
  const { goBack } = useNav();
  const insets = useSafeAreaInsets();

  const [sheet, setSheet] = useState<AppelSheet | null>(null);
  const [rows, setRows] = useState<AppelStudentRow[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** Élève dont on choisit le motif de retard. */
  const [motifFor, setMotifFor] = useState<string | null>(null);
  /** Élève dont on saisit l'observation aux parents. */
  const [obsFor, setObsFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const s = await api.appelSheet(token, entryId, date);
      setSheet(s);
      setRows(s.rows);
      setLocked(s.finalized);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [token, entryId, date, logout]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const reasonById = useMemo(
    () => new Map((sheet?.reasons ?? []).map((r) => [r.id, r])),
    [sheet],
  );

  function setCategory(studentId: string, cat: Exclude<Category, 'PRESENT'>) {
    if (locked) return;
    let openMotif = false;
    setRows((rs) =>
      rs.map((r) => {
        if (r.studentId !== studentId) return r;
        // Re-toucher la catégorie active la remet à « Présent ».
        const target: Category = categoryOf(r) === cat ? 'PRESENT' : cat;
        if (target === 'LATE' && categoryOf(r) !== 'LATE') openMotif = true;
        return {
          ...r,
          ...CAT_TO_STATE[target],
          lateMinutes: target === 'LATE' ? (r.lateMinutes ?? 12) : null,
          lateReasonId: target === 'LATE' ? r.lateReasonId : null,
        };
      }),
    );
    if (openMotif) setMotifFor(studentId);
  }

  const setMinutes = (studentId: string, minutes: number | null) =>
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, lateMinutes: minutes } : r)));

  const setReason = (studentId: string, reasonId: string | null) => {
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, lateReasonId: reasonId } : r)));
    setMotifFor(null);
  };

  const setObservation = (studentId: string, text: string, visible: boolean) => {
    setRows((rs) =>
      rs.map((r) =>
        r.studentId === studentId
          ? { ...r, observation: text.trim() ? text : null, observationVisible: visible }
          : r,
      ),
    );
    setObsFor(null);
  };

  const save = async (finalize: boolean) => {
    if (!token || rows.length === 0) return;
    setSaving(true);
    setError('');
    try {
      await api.saveAppel(token, entryId, date, {
        finalize,
        records: rows.map(({ name, ...rec }) => rec),
      });
      if (finalize) {
        Alert.alert('Appel validé', 'Les parents des absents ont été notifiés.');
        goBack();
      } else {
        Alert.alert('Brouillon enregistré');
        await load();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  const reopen = async () => {
    if (!token || !sheet?.sessionId) return;
    setSaving(true);
    setError('');
    try {
      await api.reopenAppel(token, entryId, date, sheet.sessionId);
      setLocked(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  // Bande de synthèse — mêmes cinq compteurs que le portail.
  const summary = useMemo(() => {
    const acc = { present: 0, absent: 0, lateJust: 0, lateUnjust: 0, excluded: 0 };
    for (const r of rows) {
      const cat = categoryOf(r);
      if (cat === 'PRESENT') acc.present++;
      else if (cat === 'ABSENT') acc.absent++;
      else if (cat === 'EXCLUSION') acc.excluded++;
      else if (cat === 'LATE') r.lateReasonId ? acc.lateJust++ : acc.lateUnjust++;
    }
    return acc;
  }, [rows]);

  const motifRow = rows.find((r) => r.studentId === motifFor) ?? null;
  const obsRow = rows.find((r) => r.studentId === obsFor) ?? null;

  return (
    <View style={styles.container}>
      <TeacherHeader title="Feuille d'appel" />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : !sheet ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error || 'Séance introuvable.'}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {sheet.className}
                {sheet.subject ? <Text style={styles.cardTitleMuted}> · {sheet.subject}</Text> : null}
              </Text>
              <Text style={styles.cardMeta}>
                {[dayLabel(sheet.date), `${sheet.slotStart}–${sheet.slotEnd}`, sheet.room]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {locked && <Text style={styles.locked}>Appel validé.</Text>}
            </View>

            <View style={styles.countRow}>
              <Count label="Présents" value={summary.present} color="#059669" />
              <Count label="Absents" value={summary.absent} color="#DC2626" />
              <Count label="Retards just." value={summary.lateJust} color="#D97706" />
              <Count label="Retards non just." value={summary.lateUnjust} color="#EA580C" />
            </View>

            <Text style={styles.studentsCount}>{rows.length} élèves</Text>

            {rows.map((r) => {
              const cat = categoryOf(r);
              return (
                <View key={r.studentId} style={styles.studentRow}>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <View style={styles.statusRow}>
                    {COLS.map((col) => {
                      const on = cat === col.cat;
                      return (
                        <TouchableOpacity
                          key={col.cat}
                          disabled={locked}
                          onPress={() => setCategory(r.studentId, col.cat)}
                          style={[
                            styles.statusBtn,
                            { borderColor: col.color },
                            on && { backgroundColor: col.color },
                            locked && styles.statusBtnDisabled,
                          ]}
                        >
                          <Text
                            style={[styles.statusText, { color: col.color }, on && styles.statusTextOn]}
                            numberOfLines={1}
                          >
                            {col.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Retard : durée + motif, comme sur le portail. */}
                  {cat === 'LATE' && (
                    <View style={styles.lateRow}>
                      <TextInput
                        style={styles.minutesInput}
                        value={String(r.lateMinutes ?? 12)}
                        onChangeText={(v) => setMinutes(r.studentId, v === '' ? null : Number(v))}
                        keyboardType="number-pad"
                        editable={!locked}
                      />
                      <Text style={styles.minutesLabel}>min</Text>
                      <TouchableOpacity
                        style={styles.motifBtn}
                        disabled={locked}
                        onPress={() => setMotifFor(r.studentId)}
                      >
                        <Text style={styles.motifBtnText} numberOfLines={1}>
                          {r.lateReasonId
                            ? (reasonById.get(r.lateReasonId)?.label ?? 'Motif')
                            : 'Motif non encore connu'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Observation à l'attention des parents. */}
                  <TouchableOpacity
                    style={[styles.obsBtn, r.observation ? styles.obsBtnFilled : styles.obsBtnEmpty]}
                    disabled={locked}
                    onPress={() => setObsFor(r.studentId)}
                  >
                    <Text
                      style={[
                        styles.obsText,
                        r.observation ? styles.obsTextFilled : styles.obsTextEmpty,
                      ]}
                      numberOfLines={2}
                    >
                      {r.observation ?? '＋ Observation aux parents'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {rows.length === 0 && (
              <Text style={styles.emptyText}>Aucun élève inscrit dans cette classe.</Text>
            )}
          </ScrollView>

          <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
            {locked ? (
              <TouchableOpacity
                style={[styles.btnWarn, saving && styles.btnDisabled]}
                disabled={saving || !sheet.sessionId}
                onPress={reopen}
              >
                <Text style={styles.btnWarnText}>{saving ? '…' : 'Déverrouiller'}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.btnGhost, saving && styles.btnDisabled]}
                  disabled={saving}
                  onPress={() => save(false)}
                >
                  <Text style={styles.btnGhostText}>Enregistrer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, saving && styles.btnDisabled]}
                  disabled={saving}
                  onPress={() =>
                    Alert.alert('Valider l’appel ?', 'Les parents des absents seront notifiés.', [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Valider', onPress: () => save(true) },
                    ])
                  }
                >
                  <Text style={styles.btnPrimaryText}>{saving ? '…' : "Valider l'appel"}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Modale : motif du retard */}
          <Modal visible={!!motifRow} transparent animationType="fade" onRequestClose={() => setMotifFor(null)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Sélectionner un motif de retard</Text>
                <ScrollView style={{ maxHeight: 320 }}>
                  <TouchableOpacity
                    style={styles.motifItem}
                    onPress={() => motifRow && setReason(motifRow.studentId, null)}
                  >
                    <Text style={styles.motifItemText}>Motif non encore connu</Text>
                  </TouchableOpacity>
                  {(sheet.reasons ?? []).map((reason) => (
                    <TouchableOpacity
                      key={reason.id}
                      style={styles.motifItem}
                      onPress={() => motifRow && setReason(motifRow.studentId, reason.id)}
                    >
                      <Text style={styles.motifItemText}>{reason.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity style={styles.modalClose} onPress={() => setMotifFor(null)}>
                  <Text style={styles.modalCloseText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Modale : observation aux parents */}
          {obsRow && (
            <ObservationModal
              key={obsRow.studentId}
              studentName={obsRow.name}
              initialText={obsRow.observation ?? ''}
              initialVisible={obsRow.observationVisible}
              onClose={() => setObsFor(null)}
              onSave={(text, visible) => setObservation(obsRow.studentId, text, visible)}
            />
          )}
        </>
      )}
    </View>
  );
}

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.count}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Saisie d'une observation, avec le choix de la publier aux parents. */
function ObservationModal({
  studentName,
  initialText,
  initialVisible,
  onClose,
  onSave,
}: {
  studentName: string;
  initialText: string;
  initialVisible: boolean;
  onClose: () => void;
  onSave: (text: string, visible: boolean) => void;
}) {
  const [text, setText] = useState(initialText);
  const [visible, setVisible] = useState(initialVisible);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Observations à l’attention des parents</Text>
          <Text style={styles.modalSubtitle}>{studentName}</Text>
          <TextInput
            style={styles.obsInput}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            placeholder="Votre observation…"
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.switchRow}>
            <Switch value={visible} onValueChange={setVisible} />
            <Text style={styles.switchLabel}>Publier sur l’Espace Parents</Text>
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnGhostText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => onSave(text, visible)}>
              <Text style={styles.btnPrimaryText}>Valider</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, marginBottom: 8 },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },

  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardTitleMuted: { fontWeight: '600', color: colors.textMuted },
  cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 3, textTransform: 'capitalize' },
  locked: { marginTop: 8, fontSize: 12, fontWeight: '700', color: '#B45309' },

  countRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  count: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  countValue: { fontSize: 18, fontWeight: '900' },
  countLabel: { fontSize: 9, color: colors.textMuted, textAlign: 'center' },
  studentsCount: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },

  studentRow: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 8,
  },
  studentName: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 8 },
  statusRow: { flexDirection: 'row', gap: 4 },
  statusBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 2,
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  statusBtnDisabled: { opacity: 0.6 },
  statusText: { fontSize: 10, fontWeight: '700' },
  statusTextOn: { color: colors.white },

  lateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  minutesInput: {
    width: 52,
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    paddingVertical: 6,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  minutesLabel: { fontSize: 12, color: colors.textMuted },
  motifBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: colors.bg,
  },
  motifBtnText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },

  obsBtn: { marginTop: 8, borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  obsBtnEmpty: { borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.bg },
  obsBtnFilled: { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' },
  obsText: { fontSize: 11 },
  obsTextEmpty: { color: colors.textMuted },
  obsTextFilled: { color: colors.text },

  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnGhostText: { color: colors.brand, fontWeight: '700' },
  btnPrimary: {
    flex: 1.4,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { color: colors.white, fontWeight: '800' },
  btnWarn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnWarnText: { color: '#B45309', fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  motifItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  motifItemText: { fontSize: 14, color: colors.text },
  modalClose: { marginTop: 12, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 },
  modalCloseText: { color: colors.textMuted, fontWeight: '600' },
  obsInput: {
    marginTop: 12,
    height: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
    textAlignVertical: 'top',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  switchLabel: { fontSize: 13, color: colors.text, flex: 1 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
