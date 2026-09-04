import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme';
import { useAlerts } from '../alerts';

/**
 * Cloche des alertes de l'en-tête, commune aux deux espaces : pastille du
 * nombre de non-lues, et panneau déroulant qui les liste. Toucher une alerte
 * la marque lue.
 */
export function AlertsBell() {
  const { alerts, unread, reload, markRead } = useAlerts();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => {
          reload();
          setOpen(true);
        }}
        hitSlop={8}
        accessibilityLabel="Alertes"
      >
        <Text style={styles.icon}>🔔</Text>
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Alertes</Text>
              {unread > 0 && (
                <TouchableOpacity onPress={() => markRead()}>
                  <Text style={styles.sheetAction}>Tout marquer lu</Text>
                </TouchableOpacity>
              )}
            </View>

            {alerts.length === 0 ? (
              <Text style={styles.sheetEmpty}>Aucune alerte.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {alerts.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.row, !a.read && styles.rowUnread]}
                    onPress={() => !a.read && markRead(a.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{a.title}</Text>
                      {a.body ? (
                        <Text style={styles.rowBody} numberOfLines={3}>
                          {a.body}
                        </Text>
                      ) : null}
                      <Text style={styles.rowDate}>
                        {new Date(a.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </Text>
                    </View>
                    {!a.read && <View style={styles.dot} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: { padding: 6, marginLeft: 2 },
  icon: { color: colors.white, fontSize: 20 },
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
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sheetTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  sheetAction: { fontSize: 12, fontWeight: '700', color: colors.brand },
  sheetEmpty: { padding: 20, textAlign: 'center', color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  rowUnread: { backgroundColor: '#EFF3FF' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowBody: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rowDate: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
