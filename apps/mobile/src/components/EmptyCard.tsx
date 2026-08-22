import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/**
 * État « rien à afficher », présenté comme les autres contenus : une carte à
 * bordure bleue fine plutôt qu'une ligne de texte perdue dans le vide. Utilisé
 * partout (accueil, notes, cahier, vie scolaire, messagerie, annonces…) pour
 * que la page garde la même trame qu'elle soit remplie ou non.
 */
export function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.brand200,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  text: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
});
