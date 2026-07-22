import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useAppState } from '../app-state';
import { useNav } from '../navigation';

/**
 * En-tête vert façon Pronote : sélecteur d'enfant scolarisé (menu déroulant),
 * titre de la page, bouton accueil et bouton menu latéral avec pastille de
 * notifications. Affiché en haut de chaque écran principal.
 */
export function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const { children, selectedChild, setSelectedId, openMenu, me } = useAppState();
  const { navigate, route, goBack, canGoBack } = useNav();
  const [pickerOpen, setPickerOpen] = useState(false);

  const parentName = me?.user.name ?? me?.user.email ?? 'Parent';
  const unread = me?.unreadMessages ?? 0;
  const initials = selectedChild
    ? `${selectedChild.firstName[0] ?? ''}${selectedChild.lastName[0] ?? ''}`.toUpperCase()
    : '👤';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        {/* Avatar + sélecteur d'enfant */}
        <TouchableOpacity
          style={styles.selector}
          onPress={() => children.length > 1 && setPickerOpen(true)}
          activeOpacity={children.length > 1 ? 0.7 : 1}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ maxWidth: 150 }}>
            <Text style={styles.parent} numberOfLines={1}>
              {parentName}
            </Text>
            {selectedChild && (
              <Text style={styles.child} numberOfLines={1}>
                {selectedChild.firstName}
                {selectedChild.className ? ` · ${selectedChild.className}` : ''}
                {children.length > 1 ? '  ▾' : ''}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* Accueil */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => (route.name === 'home' ? undefined : navigate({ name: 'home' }))}
          hitSlop={8}
        >
          <Text style={styles.icon}>🏠</Text>
        </TouchableOpacity>

        {/* Menu latéral (ou retour si on est sur un écran empilé) */}
        {canGoBack ? (
          <TouchableOpacity style={styles.iconBtn} onPress={goBack} hitSlop={8}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.iconBtn} onPress={openMenu} hitSlop={8}>
            <Text style={styles.icon}>☰</Text>
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {/* Sélecteur d'enfant (liste des enfants scolarisés) */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Enfants scolarisés</Text>
            {children.map((c) => {
              const on = c.id === selectedChild?.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.childRow, on && styles.childRowOn]}
                  onPress={() => {
                    setSelectedId(c.id);
                    setPickerOpen(false);
                  }}
                >
                  <View style={[styles.avatar, styles.avatarDark]}>
                    <Text style={styles.avatarTextDark}>
                      {`${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.childRowName}>
                      {c.firstName} {c.lastName}
                    </Text>
                    {c.className && <Text style={styles.childRowClass}>{c.className}</Text>}
                  </View>
                  {on && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.brand, paddingHorizontal: 12, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingRight: 8 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  avatarDark: { backgroundColor: colors.brand },
  avatarTextDark: { color: colors.white, fontWeight: '800', fontSize: 13 },
  parent: { color: colors.white, fontWeight: '800', fontSize: 14 },
  child: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
  iconBtn: { padding: 6, marginLeft: 2 },
  icon: { color: colors.white, fontSize: 20 },
  backIcon: { color: colors.white, fontSize: 30, lineHeight: 30, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  title: { color: colors.white, fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-start' },
  sheet: { backgroundColor: colors.card, margin: 12, marginTop: 90, borderRadius: 16, padding: 8 },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 },
  childRowOn: { backgroundColor: '#EFF3FF' },
  childRowName: { fontSize: 15, fontWeight: '700', color: colors.text },
  childRowClass: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  check: { color: colors.brand, fontWeight: '900', fontSize: 16 },
});
