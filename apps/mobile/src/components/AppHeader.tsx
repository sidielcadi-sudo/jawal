import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useAppState } from '../app-state';
import { useNav } from '../navigation';

/**
 * En-tête vert façon Pronote : sélecteur d'enfant scolarisé (menu déroulant),
 * titre de la page, bouton accueil et bouton menu latéral avec pastille de
 * notifications. Affiché en haut de chaque écran principal.
 */
export function AppHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { children, selectedChild, setSelectedId, openMenu, me } = useAppState();
  const { navigate, route, goBack, canGoBack } = useNav();
  const [pickerOpen, setPickerOpen] = useState(false);

  const unread = me?.unreadMessages ?? 0;
  const initials = selectedChild
    ? `${selectedChild.firstName[0] ?? ''}${selectedChild.lastName[0] ?? ''}`.toUpperCase()
    : '👤';
  // Avec un seul enfant, rien à choisir : le sélecteur reste discret. Avec
  // plusieurs, il devient une pastille cliquable bien identifiable.
  const multi = children.length > 1;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        {/* Photo de l'élève consulté, en petit format : elle dit d'un coup
            d'œil de quel enfant on regarde le dossier. */}
        {selectedChild?.photoUrl ? (
          <Image source={{ uri: selectedChild.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}

        <View style={{ flex: 1 }} />

        {right}

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

      {/* À la place de l'ancien titre : le sélecteur d'enfant, plus grand,
          avec sa flèche en orange. Sans enfant multiple, simple libellé. */}
      <TouchableOpacity
        style={[styles.childLine, multi && styles.childLineBordered]}
        onPress={() => multi && setPickerOpen(true)}
        activeOpacity={multi ? 0.7 : 1}
        accessibilityRole={multi ? 'button' : undefined}
        accessibilityLabel={multi ? 'Changer d’enfant' : undefined}
      >
        <Text style={styles.childName} numberOfLines={1}>
          {selectedChild
            ? `${selectedChild.firstName}${selectedChild.className ? ` · ${selectedChild.className}` : ''}`
            : title}
        </Text>
        {multi && (
          <View style={styles.childArrowDot}>
            <Text style={styles.childArrow}>▾</Text>
          </View>
        )}
      </TouchableOpacity>

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
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  /** Ligne du sélecteur d'enfant, à la place de l'ancien titre. */
  childLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  childLineBordered: {
    alignSelf: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  childName: { color: colors.white, fontSize: 19, fontWeight: '700' },
  childArrowDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childArrow: { color: colors.brand, fontSize: 14, fontWeight: '900', lineHeight: 16 },
  avatarDark: { backgroundColor: colors.brand },
  avatarTextDark: { color: colors.white, fontWeight: '800', fontSize: 13 },
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
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  childRowOn: { backgroundColor: '#EFF3FF', borderWidth: 1, borderColor: colors.brand200 },
  childRowName: { fontSize: 16, fontWeight: '700', color: colors.text },
  childRowClass: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  check: { color: colors.brand, fontWeight: '900', fontSize: 16 },
});
