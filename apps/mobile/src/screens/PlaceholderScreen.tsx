import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PortalHeader } from '../components/PortalHeader';
import { colors } from '../theme';

/** Écran d'attente pour les rubriques du portail pas encore portées sur mobile. */
export default function PlaceholderScreen({ title, note }: { title: string; note?: string }) {
  return (
    <View style={styles.container}>
      <PortalHeader title={title} />
      <View style={styles.body}>
        <Text style={styles.icon}>🌐</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.note}>{note ?? 'Bientôt disponible dans l’application.'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  note: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
});
