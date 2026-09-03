import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useTeacherState } from '../teacher-state';
import { useAuth } from '../auth';
import { useNav, type Route } from '../navigation';

type Item = { key: string; label: string; icon: string; route: Route; badge?: number };

/**
 * Menu latéral de l'espace enseignant : reprend les entrées du portail prof.
 * Ce qui n'a pas encore d'écran mobile renvoie vers un écran d'attente plutôt
 * que d'être masqué — le prof sait ainsi que la fonction existe, et où la
 * trouver en attendant.
 */
export function TeacherDrawer() {
  const insets = useSafeAreaInsets();
  const { menuOpen, closeMenu, me } = useTeacherState();
  const { logout } = useAuth();
  const { navigate } = useNav();

  const unread = me?.unreadMessages ?? 0;
  const teacher = me?.teacher;

  const go = (r: Route) => {
    closeMenu();
    navigate(r);
  };

  const web = (title: string): Route => ({
    name: 'placeholder',
    title,
    note: 'Disponible sur le portail web.',
  });

  const items: Item[] = [
    { key: 'appel', label: "Feuilles d'appel", icon: '✅', route: { name: 'teacher', tab: 'appel' }, badge: me?.missingAppels },
    { key: 'notes', label: 'Notes', icon: '📝', route: { name: 'teacher', tab: 'notes' } },
    { key: 'leave', label: 'Congés & absences', icon: '🌴', route: { name: 'teacher', tab: 'leave' } },
    { key: 'messages', label: 'Messages', icon: '✉️', route: { name: 'messages' }, badge: unread },
  ];

  const soon: Item[] = [
    { key: 'timetable', label: 'Emploi du temps', icon: '🗓️', route: web('Emploi du temps') },
    { key: 'cahier', label: 'Cahier de texte', icon: '📓', route: web('Cahier de texte') },
    { key: 'competences', label: 'Compétences et aptitudes', icon: '🎯', route: web('Compétences et aptitudes') },
    { key: 'carnet', label: 'Carnet de correspondance', icon: '📒', route: web('Carnet de correspondance') },
    { key: 'soutien', label: 'Soutien scolaire', icon: '📚', route: web('Soutien scolaire') },
    { key: 'account', label: 'Mon compte', icon: '👤', route: web('Mon compte') },
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
        <Pressable style={[styles.panel, { paddingTop: insets.top + 12 }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={styles.headName}>
              {teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Enseignant'}
            </Text>
            {me?.yearLabel && <Text style={styles.headMeta}>{me.yearLabel}</Text>}
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}>
            <TouchableOpacity style={styles.item} onPress={() => go({ name: 'home' })}>
              <Text style={styles.itemIcon}>🏠</Text>
              <Text style={styles.itemLabel}>Page d'accueil</Text>
            </TouchableOpacity>

            <Text style={styles.section}>Ma classe</Text>
            {items.map(renderItem)}

            <Text style={styles.section}>Sur le portail web</Text>
            {soon.map(renderItem)}

            <View style={styles.sep} />
            <TouchableOpacity
              style={styles.item}
              onPress={() => {
                closeMenu();
                logout();
              }}
            >
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
  headName: { color: colors.white, fontSize: 16, fontWeight: '800' },
  headMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
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
