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

/**
 * Saisie des notes d'un couple classe × matière.
 *
 * Sur mobile on saisit un devoir à la fois, élève par élève : la grille à deux
 * dimensions du portail web est illisible sur un écran de téléphone. Le devoir
 * se choisit en haut, la liste dessous ne montre que la colonne concernée.
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

            {grid.devoirs.length === 0 ? (
              <EmptyCard text="Aucun devoir sur cette période. Créez-le depuis le portail web." />
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
