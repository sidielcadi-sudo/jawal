import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../components/AppHeader';
import { EmptyCard } from '../components/EmptyCard';
import { Header } from '../components/Header';
import { useAuth } from '../auth';
import { useNav } from '../navigation';
import { api, ApiError, type ConversationSummary } from '../api';
import { colors } from '../theme';

export default function MessagesScreen() {
  const { token, logout } = useAuth();
  const { goBack, navigate } = useNav();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const res = await api.messages(token);
      setItems(res.conversations);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    load();
  }, [load]);

  if (composing) {
    return <Compose onDone={(reload) => { setComposing(false); if (reload) load(); }} />;
  }

  return (
    <View style={styles.container}>
      {/* Barre complète (sélecteur d'enfant, accueil, menu) comme sur les
          autres écrans principaux — et non le simple bandeau titre+retour. */}
      <AppHeader
        title="Messagerie"
        right={
          <TouchableOpacity onPress={() => setComposing(true)} hitSlop={10} style={styles.newBtn}>
            <Text style={styles.newBtnText}>Nouveau</Text>
          </TouchableOpacity>
        }
      />
      {loading ? (
        <ActivityIndicator color={colors.brand} size="large" style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
          ListEmptyComponent={
            <EmptyCard text={error || 'Aucune conversation. Touchez « Nouveau » pour écrire à l’école.'} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigate({ name: 'thread', conversationId: item.id, subject: item.subject })}
            >
              <View style={styles.rowTop}>
                {item.unread ? <View style={styles.dot} /> : null}
                <Text style={[styles.subject, item.unread && styles.subjectUnread]} numberOfLines={1}>
                  {item.subject}
                </Text>
                <Text style={styles.date}>{new Date(item.updatedAt).toLocaleDateString('fr-FR')}</Text>
              </View>
              {item.last ? (
                <Text style={styles.preview} numberOfLines={1}>
                  {item.last.mine ? 'Vous : ' : ''}
                  {item.last.body}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function Compose({ onDone }: { onDone: (reload: boolean) => void }) {
  const { token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!token) return;
    if (subject.trim().length < 2) return Alert.alert('Objet requis', 'Indiquez un objet (2 caractères min).');
    if (!body.trim()) return Alert.alert('Message vide', 'Écrivez votre message.');
    setSending(true);
    try {
      await api.startConversation(token, subject.trim(), body.trim());
      onDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      Alert.alert('Erreur', e instanceof ApiError ? e.message : 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Nouveau message" onBack={() => onDone(false)} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={{ padding: 16, paddingBottom: insets.bottom + 16 }}>
          <Text style={styles.label}>Objet</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="Ex. Absence de mon enfant"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Message</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={body}
            onChangeText={setBody}
            placeholder="Votre message à l’établissement…"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending}>
            <Text style={styles.sendBtnText}>{sending ? 'Envoi…' : 'Envoyer'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24, paddingHorizontal: 24, lineHeight: 20 },
  newBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  newBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginRight: 8 },
  subject: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  subjectUnread: { fontWeight: '800' },
  date: { fontSize: 11, color: colors.textMuted, marginLeft: 8 },
  preview: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brand200,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  textarea: { minHeight: 140, textAlignVertical: 'top' },
  sendBtn: {
    marginTop: 18,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  sendBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
