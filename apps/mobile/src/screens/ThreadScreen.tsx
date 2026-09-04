import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PortalHeader } from '../components/PortalHeader';
import { EmptyCard } from '../components/EmptyCard';
import { useAuth } from '../auth';
import { useNav } from '../navigation';
import { api, ApiError, type ThreadMessage } from '../api';
import { colors } from '../theme';

export default function ThreadScreen({ conversationId, subject }: { conversationId: string; subject?: string }) {
  const { token, logout } = useAuth();
  const { goBack } = useNav();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ThreadMessage>>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [title, setTitle] = useState(subject ?? 'Conversation');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const res = await api.thread(token, conversationId);
      setMessages(res.messages);
      setTitle(res.subject);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [token, conversationId, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!token || !text) return;
    setSending(true);
    try {
      await api.reply(token, conversationId, text);
      setDraft('');
      await load();
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <PortalHeader title={title} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} size="large" style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<EmptyCard text={error || 'Aucun message.'} />}
            renderItem={({ item }) => (
              <View style={[styles.bubbleRow, item.mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.meta, item.mine ? styles.metaMine : styles.metaTheirs]}>
                    {item.mine ? 'Vous' : item.senderName ?? 'École'} ·{' '}
                    {new Date(item.sentAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                  <Text style={[styles.body, item.mine ? styles.bodyMine : styles.bodyTheirs]}>{item.body}</Text>
                </View>
              </View>
            )}
          />
        )}
        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Votre réponse…"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}
            onPress={send}
            disabled={!draft.trim() || sending}
          >
            <Text style={styles.sendBtnText}>{sending ? '…' : 'Envoyer'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  bubbleRow: { marginBottom: 10, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.brand200, borderBottomLeftRadius: 4 },
  meta: { fontSize: 10, marginBottom: 3 },
  metaMine: { color: 'rgba(255,255,255,0.8)' },
  metaTheirs: { color: colors.textMuted },
  body: { fontSize: 15, lineHeight: 20 },
  bodyMine: { color: colors.white },
  bodyTheirs: { color: colors.text },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.bg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brand200,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.text,
  },
  sendBtn: {
    marginLeft: 8,
    backgroundColor: colors.brand,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendBtnText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
