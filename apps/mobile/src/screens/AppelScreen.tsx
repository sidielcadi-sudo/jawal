import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useNav } from '../navigation';
import { api, ApiError, type AppelSheet, type AppelStatus, type AppelStudentRow } from '../api';
import { TeacherHeader } from '../components/TeacherHeader';
import { colors } from '../theme';

/** Les quatre états d'un élève, dans l'ordre où le prof les utilise. */
const STATUSES: { key: AppelStatus; label: string; color: string }[] = [
  { key: 'PRESENT', label: 'Présent', color: '#059669' },
  { key: 'ABSENT', label: 'Absent', color: '#DC2626' },
  { key: 'LATE', label: 'Retard', color: '#D97706' },
  { key: 'EXCUSED', label: 'Dispensé', color: '#64748B' },
];

/**
 * Feuille d'appel d'une séance.
 *
 * Tous les élèves sont présents par défaut : sur mobile on ne pointe que les
 * exceptions, ce qui rend l'appel faisable en quelques touches. L'appel n'est
 * verrouillé qu'à la validation ; avant cela on peut enregistrer un brouillon.
 */
export default function AppelScreen({ entryId, date }: { entryId: string; date: string }) {
  const { token, logout } = useAuth();
  const { goBack } = useNav();
  const insets = useSafeAreaInsets();

  const [sheet, setSheet] = useState<AppelSheet | null>(null);
  const [rows, setRows] = useState<AppelStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const s = await api.appelSheet(token, entryId, date);
      setSheet(s);
      setRows(s.rows);
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

  const setStatus = (studentId: string, status: AppelStatus) => {
    setRows((rs) =>
      rs.map((r) =>
        r.studentId === studentId
          ? { ...r, status, lateMinutes: status === 'LATE' ? (r.lateMinutes ?? 5) : null }
          : r,
      ),
    );
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

  const counts = STATUSES.map((s) => ({
    ...s,
    n: rows.filter((r) => r.status === s.key).length,
  }));

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
              <Text style={styles.cardTitle}>{sheet.className}</Text>
              <Text style={styles.cardMeta}>
                {[sheet.subject, sheet.room].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.cardMeta}>
                {sheet.slotStart} – {sheet.slotEnd}
              </Text>
              {sheet.finalized && <Text style={styles.locked}>Appel validé — modification verrouillée.</Text>}
            </View>

            <View style={styles.countRow}>
              {counts.map((c) => (
                <View key={c.key} style={styles.count}>
                  <Text style={[styles.countValue, { color: c.color }]}>{c.n}</Text>
                  <Text style={styles.countLabel}>{c.label}</Text>
                </View>
              ))}
            </View>

            {rows.map((r) => (
              <View key={r.studentId} style={styles.studentRow}>
                <Text style={styles.studentName} numberOfLines={1}>
                  {r.name}
                </Text>
                <View style={styles.statusRow}>
                  {STATUSES.map((s) => {
                    const on = r.status === s.key;
                    return (
                      <TouchableOpacity
                        key={s.key}
                        disabled={sheet.finalized}
                        onPress={() => setStatus(r.studentId, s.key)}
                        style={[
                          styles.statusBtn,
                          on && { backgroundColor: s.color, borderColor: s.color },
                          sheet.finalized && styles.statusBtnDisabled,
                        ]}
                      >
                        <Text style={[styles.statusText, on && styles.statusTextOn]}>
                          {s.label.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {!sheet.finalized && (
            <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
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

  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  locked: { marginTop: 8, fontSize: 12, fontWeight: '700', color: '#B45309' },

  countRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  count: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    alignItems: 'center',
  },
  countValue: { fontSize: 18, fontWeight: '900' },
  countLabel: { fontSize: 10, color: colors.textMuted },

  studentRow: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 8,
  },
  studentName: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 8 },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  statusBtnDisabled: { opacity: 0.6 },
  statusText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  statusTextOn: { color: colors.white },

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
  btnDisabled: { opacity: 0.6 },
});
