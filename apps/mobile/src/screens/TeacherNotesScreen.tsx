import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { api, ApiError, type TeacherNotesGrid } from '../api';
import { TeacherHeader } from '../components/TeacherHeader';
import { EmptyCard } from '../components/EmptyCard';
import { colors } from '../theme';

/** Note saisie mais pas encore envoyée, indexée par `devoirId|élèveId`. */
type Draft = Record<string, string>;

const key = (devoirId: string, studentId: string) => `${devoirId}|${studentId}`;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Saisie des notes d'un couple classe × matière.
 *
 * Sur mobile on saisit un devoir à la fois, élève par élève : la grille à deux
 * dimensions du portail web est illisible sur un écran de téléphone. Le devoir
 * se choisit en haut, la liste dessous ne montre que la colonne concernée.
 *
 * Le prof peut aussi créer le devoir ici : sans cela il devait ouvrir le
 * portail web avant de pouvoir saisir la moindre note en classe.
 */
export default function TeacherNotesScreen({
  classId,
  subjectId,
  title,
}: {
  classId: string;
  subjectId: string;
  title: string;
}) {
  const { token, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [grid, setGrid] = useState<TeacherNotesGrid | null>(null);
  const [periodId, setPeriodId] = useState<string | undefined>(undefined);
  const [devoirId, setDevoirId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /* Formulaire « nouveau devoir ». */
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDate, setNewDate] = useState(() => ymd(new Date()));
  const [newMax, setNewMax] = useState('20');
  const [newWeight, setNewWeight] = useState('1');
  const [savingDevoir, setSavingDevoir] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const g = await api.teacherNotes(token, classId, subjectId, periodId);
      setGrid(g);
      setPeriodId(g.periodId);
      setDevoirId((cur) => (cur && g.devoirs.some((d) => d.id === cur) ? cur : (g.devoirs[0]?.id ?? null)));
      setDraft({});
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [token, classId, subjectId, periodId, logout]);

  useEffect(() => {
    setLoading(true);
    load();
    // `periodId` change volontairement le chargement : c'est le filtre principal.
  }, [load]);

  const devoir = grid?.devoirs.find((d) => d.id === devoirId) ?? null;

  const createDevoir = async () => {
    if (!token || !grid) return;
    const label = newLabel.trim();
    if (!label) {
      Alert.alert('Libellé manquant', 'Donnez un nom au devoir (ex. « Contrôle n°1 »).');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      Alert.alert('Date invalide', 'Format attendu : AAAA-MM-JJ.');
      return;
    }
    const maxValue = Number(newMax.replace(',', '.'));
    const weight = Number(newWeight.replace(',', '.'));
    if (!Number.isFinite(maxValue) || maxValue < 1) {
      Alert.alert('Barème invalide', 'Le barème doit être un nombre d’au moins 1.');
      return;
    }
    if (!Number.isFinite(weight) || weight < 0.1) {
      Alert.alert('Coefficient invalide', 'Le coefficient doit être d’au moins 0,1.');
      return;
    }

    setSavingDevoir(true);
    setError('');
    try {
      const res = await api.createTeacherDevoir(token, classId, subjectId, {
        periodId: grid.periodId,
        label,
        date: newDate,
        maxValue,
        weight,
      });
      // Le nouveau devoir devient la colonne courante : le prof enchaîne
      // directement sur la saisie des notes.
      setDevoirId(res.id);
      setCreating(false);
      setNewLabel('');
      setNewMax('20');
      setNewWeight('1');
      setNewDate(ymd(new Date()));
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setSavingDevoir(false);
    }
  };

  const save = async () => {
    if (!token || !devoir) return;
    const cells = Object.entries(draft)
      .map(([k, raw]) => {
        const [dId, sId] = k.split('|');
        const text = raw.trim().replace(',', '.');
        const value = text === '' ? null : Number(text);
        return { evaluationId: dId!, studentId: sId!, value };
      })
      .filter((c) => c.value === null || Number.isFinite(c.value));

    if (cells.length === 0) {
      Alert.alert('Rien à enregistrer');
      return;
    }
    const over = cells.find((c) => c.value !== null && c.value > devoir.maxValue);
    if (over) {
      Alert.alert('Note hors barème', `Une note dépasse le barème /${devoir.maxValue}.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.saveTeacherNotes(token, classId, subjectId, cells);
      Alert.alert('Notes enregistrées');
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <TeacherHeader title={title} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : !grid ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error || 'Données indisponibles.'}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.title}>{title}</Text>

            {/* Période */}
            <View style={styles.chipWrap}>
              {grid.periods.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, grid.periodId === p.id && styles.chipOn]}
                  onPress={() => setPeriodId(p.id)}
                >
                  <Text style={[styles.chipText, grid.periodId === p.id && styles.chipTextOn]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Création d'un devoir — la colonne de notes se prépare ici. */}
            {creating ? (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Nouveau devoir</Text>

                <Text style={styles.fieldLabel}>Libellé</Text>
                <TextInput
                  style={styles.input}
                  value={newLabel}
                  onChangeText={setNewLabel}
                  placeholder="Contrôle n°1"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.fieldLabel}>Date (AAAA-MM-JJ)</Text>
                <TextInput
                  style={styles.input}
                  value={newDate}
                  onChangeText={setNewDate}
                  placeholder="2026-09-10"
                  placeholderTextColor={colors.textMuted}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Barème</Text>
                    <TextInput
                      style={styles.input}
                      value={newMax}
                      onChangeText={setNewMax}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Coefficient</Text>
                    <TextInput
                      style={styles.input}
                      value={newWeight}
                      onChangeText={setNewWeight}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    style={styles.btnGhost}
                    disabled={savingDevoir}
                    onPress={() => setCreating(false)}
                  >
                    <Text style={styles.btnGhostText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnCreate, { flex: 1, marginTop: 0 }, savingDevoir && { opacity: 0.6 }]}
                    disabled={savingDevoir}
                    onPress={createDevoir}
                  >
                    <Text style={styles.btnPrimaryText}>{savingDevoir ? '…' : 'Créer'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.btnCreate} onPress={() => setCreating(true)}>
                <Text style={styles.btnPrimaryText}>＋ Nouveau devoir</Text>
              </TouchableOpacity>
            )}

            {grid.devoirs.length === 0 ? (
              <EmptyCard text="Aucun devoir sur cette période. Créez-en un pour saisir des notes." />
            ) : (
              <>
                {/* Devoir courant */}
                <Text style={styles.fieldLabel}>Devoir</Text>
                <View style={styles.chipWrap}>
                  {grid.devoirs.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.chip, devoirId === d.id && styles.chipOn]}
                      onPress={() => setDevoirId(d.id)}
                    >
                      <Text style={[styles.chipText, devoirId === d.id && styles.chipTextOn]}>
                        {d.label} /{d.maxValue}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {devoir && (
                  <>
                    <Text style={styles.devoirMeta}>
                      {devoir.date} · barème /{devoir.maxValue} · coefficient ×{devoir.weight}
                    </Text>
                    {grid.students.map((s) => {
                      const k = key(devoir.id, s.id);
                      const saved = devoir.grades[s.id];
                      const shown = draft[k] ?? (saved === null || saved === undefined ? '' : String(saved));
                      return (
                        <View key={s.id} style={styles.studentRow}>
                          <Text style={styles.studentName} numberOfLines={1}>
                            {s.name}
                          </Text>
                          <TextInput
                            style={styles.noteInput}
                            value={shown}
                            onChangeText={(v) => setDraft((d) => ({ ...d, [k]: v }))}
                            keyboardType="decimal-pad"
                            placeholder="—"
                            placeholderTextColor={colors.textMuted}
                          />
                          <Text style={styles.noteMax}>/{devoir.maxValue}</Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </ScrollView>

          {devoir && (
            <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
              <TouchableOpacity
                style={[styles.btnPrimary, saving && { opacity: 0.6 }]}
                disabled={saving}
                onPress={save}
              >
                <Text style={styles.btnPrimaryText}>
                  {saving ? '…' : `Enregistrer (${Object.keys(draft).length})`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, marginTop: 12, marginBottom: 6 },
  devoirMeta: { fontSize: 12, color: colors.textMuted, marginTop: 10, marginBottom: 8 },

  /* ── Création d'un devoir ───────────────────────────────────────────── */
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 14,
    marginTop: 14,
  },
  formTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
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
  btnCreate: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
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

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTextOn: { color: colors.white },

  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  studentName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  noteInput: {
    width: 64,
    borderWidth: 1,
    borderColor: colors.brand200,
    borderRadius: 8,
    paddingVertical: 8,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  noteMax: { fontSize: 12, color: colors.textMuted, width: 28 },

  bar: {
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
  btnPrimary: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnPrimaryText: { color: colors.white, fontWeight: '800' },
});
