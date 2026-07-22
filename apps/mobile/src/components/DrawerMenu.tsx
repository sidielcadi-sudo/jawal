import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useAppState } from '../app-state';
import { useAuth } from '../auth';
import { useNav, type Route } from '../navigation';

type Item = { key: string; label: string; icon: string; route: Route; badge?: number };

/**
 * Menu latéral façon Pronote : reprend les liens du portail Parent. Les entrées
 * « par enfant » agissent sur l'enfant sélectionné dans l'en-tête ; les entrées
 * générales couvrent tout le compte.
 */
export function DrawerMenu() {
  const insets = useSafeAreaInsets();
  const { menuOpen, closeMenu, me, selectedChild } = useAppState();
  const { logout } = useAuth();
  const { navigate } = useNav();

  const unread = me?.unreadMessages ?? 0;
  const parentName = me?.user.name ?? me?.user.email ?? 'Parent';

  const go = (r: Route) => {
    closeMenu();
    navigate(r);
  };

  // Liens par enfant (sélectionné) — miroir des sections du portail Parent.
  const childItems: Item[] = [
    { key: 'cahier', label: 'Cahier de textes', icon: '📓', route: { name: 'child', tab: 'cahier' } },
    { key: 'notes', label: 'Notes', icon: '📝', route: { name: 'child', tab: 'notes' } },
    { key: 'vie', label: 'Vie scolaire', icon: '📅', route: { name: 'child', tab: 'vie' } },
    { key: 'competences', label: 'Compétences', icon: '🎯', route: { name: 'child', tab: 'competences' } },
    { key: 'soutien', label: 'Soutien scolaire', icon: '📚', route: { name: 'child', tab: 'soutien' } },
    { key: 'scolarite', label: 'Scolarité & paiements', icon: '💰', route: { name: 'child', tab: 'scolarite' } },
  ];

  // Liens généraux (tout le compte).
  const generalItems: Item[] = [
    { key: 'announcements', label: 'Annonces', icon: '📢', route: { name: 'announcements' } },
    { key: 'messages', label: 'Messagerie', icon: '✉️', route: { name: 'messages' }, badge: unread },
    { key: 'bourse', label: 'Bourse aux livres', icon: '📖', route: { name: 'placeholder', title: 'Bourse aux livres', note: 'Disponible sur le portail web.' } },
    { key: 'surveys', label: 'Sondages', icon: '🗳️', route: { name: 'placeholder', title: 'Sondages', note: 'Disponible sur le portail web.' } },
    { key: 'account', label: 'Informations personnelles', icon: '👤', route: { name: 'placeholder', title: 'Informations personnelles', note: 'Disponible sur le portail web.' } },
  ];

  const renderItem = (it: Item) => (
    <TouchableOpacity key={it.key} style={styles.item} onPress={() => go(it.route)}>
      <Text style={styles.itemIcon}>{it.icon}</Text>
      <Text style={styles.itemLabel}>{it.label}</Text>
      {it.badge && it.badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{it.badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
      <Pressable style={styles.backdrop} onPress={closeMenu}>
        {/* Empêche la fermeture au tap dans le panneau */}
        <Pressable style={[styles.panel, { paddingTop: insets.top + 12 }]} onPress={() => {}}>
          {/* En-tête du menu */}
          <View style={styles.head}>
            <Text style={styles.headParent}>{parentName}</Text>
            {selectedChild && (
              <Text style={styles.headChild}>
                {selectedChild.firstName} {selectedChild.lastName}
                {selectedChild.className ? ` (${selectedChild.className})` : ''}
              </Text>
            )}
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}>
            <TouchableOpacity style={styles.item} onPress={() => go({ name: 'home' })}>
              <Text style={styles.itemIcon}>🏠</Text>
              <Text style={styles.itemLabel}>Page d'accueil</Text>
            </TouchableOpacity>

            <Text style={styles.section}>Suivi de l'enfant</Text>
            {childItems.map(renderItem)}

            <Text style={styles.section}>Général</Text>
            {generalItems.map(renderItem)}

            <View style={styles.sep} />
            <TouchableOpacity style={styles.item} onPress={() => { closeMenu(); logout(); }}>
              <Text style={styles.itemIcon}>⏻</Text>
              <Text style={[styles.itemLabel, { color: '#FCA5A5' }]}>Déconnexion</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: { width: '82%', maxWidth: 340, height: '100%', backgroundColor: '#2B2F36', paddingHorizontal: 4 },
  head: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)' },
  headParent: { color: colors.white, fontSize: 16, fontWeight: '800' },
  headChild: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  section: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  itemIcon: { fontSize: 17, width: 22, textAlign: 'center' },
  itemLabel: { color: colors.white, fontSize: 15, fontWeight: '600', flex: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 8, marginHorizontal: 16 },
});
