import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useTeacherState } from '../teacher-state';
import { useNav } from '../navigation';
import { AlertsBell } from './AlertsBell';

/**
 * En-tête de l'espace enseignant — même bandeau bleu que l'espace parent, mais
 * l'identité affichée est celle du professeur connecté : c'est lui le sujet de
 * tous les écrans, là où l'espace parent bascule d'un enfant à l'autre.
 */
export function TeacherHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { me, openMenu } = useTeacherState();
  const { navigate, route, goBack, canGoBack } = useNav();

  const teacher = me?.teacher;
  const unread = me?.unreadMessages ?? 0;
  const initials = teacher
    ? `${teacher.firstName[0] ?? ''}${teacher.lastName[0] ?? ''}`.toUpperCase()
    : '👤';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        {teacher?.photoUrl ? (
          <Image source={{ uri: teacher.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}

        <View style={{ flex: 1 }} />

        {right}

        {/* Cloche des alertes, à gauche de l'accueil. */}
        <AlertsBell />

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => (route.name === 'home' ? undefined : navigate({ name: 'home' }))}
          hitSlop={8}
        >
          <Text style={styles.icon}>🏠</Text>
        </TouchableOpacity>

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

      {/* Nom du professeur, à la place du sélecteur d'enfant de l'espace parent. */}
      <View style={styles.nameLine}>
        <Text style={styles.name} numberOfLines={1}>
          {teacher ? `${teacher.firstName} ${teacher.lastName}` : title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.brand, paddingHorizontal: 12, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  nameLine: { alignItems: 'center', marginTop: 10 },
  name: { color: colors.white, fontSize: 19, fontWeight: '700' },
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
});
