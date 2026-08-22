import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { colors } from '../theme';
import { SchoolIllustration } from '../components/SchoolIllustration';

/**
 * Écran de connexion — reprend la mise en page du portail web (/fr/login) :
 * un bloc « identité » (illustration, nom de l'app, signature) et un bloc
 * « formulaire » sur fond bleu dégradé. Sur mobile, les deux colonnes du web
 * sont empilées, **le formulaire sous le bloc identité**.
 */
export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [tenantSlug, setTenantSlug] = useState('demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError('');
    if (!tenantSlug.trim() || !email.trim() || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setBusy(true);
    try {
      await login(tenantSlug.trim(), email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {/* ── Bloc identité (colonne droite du web) ─────────────────── */}
          <View style={styles.identity}>
            <SchoolIllustration width={260} height={195} />

            <Text style={styles.brandName}>LEADSCHOOL</Text>
            <View style={styles.taglineRow}>
              <View style={styles.rule} />
              <Text style={styles.tagline}>ESPACE PARENTS</Text>
              <View style={styles.rule} />
            </View>

            <Text style={styles.editor}>Edited by LeadTech</Text>
          </View>

          {/* ── Bloc formulaire (colonne gauche du web), placé dessous ── */}
          <LinearGradient
            colors={[colors.brand700, colors.brand900]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.form}
          >
            <Text style={styles.welcome}>Bienvenue sur LeadSchool !</Text>
            <Text style={styles.welcomeSub}>Accédez à l'espace parents de votre établissement.</Text>

            <Field
              icon="building"
              value={tenantSlug}
              onChangeText={setTenantSlug}
              placeholder="Identifiant de l'établissement"
              autoCapitalize="none"
            />
            <Field
              icon="mail"
              value={email}
              onChangeText={setEmail}
              placeholder="Adresse email"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              icon="lock"
              value={password}
              onChangeText={setPassword}
              placeholder="Mot de passe"
              secureTextEntry
              onSubmitEditing={onSubmit}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Se connecter</Text>
              )}
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Champ à icône, sur fond clair — équivalent du champ du portail web. */
function Field({
  icon,
  ...input
}: React.ComponentProps<typeof TextInput> & { icon: 'building' | 'mail' | 'lock' }) {
  const glyph = { building: '🏫', mail: '✉️', lock: '🔒' }[icon];
  return (
    <View style={styles.field}>
      <Text style={styles.fieldIcon}>{glyph}</Text>
      <TextInput
        {...input}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.brand50 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  identity: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  brandName: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 3,
    color: colors.brand800,
  },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  rule: { width: 32, height: 1, backgroundColor: colors.amber },
  tagline: { fontSize: 10, fontWeight: '600', letterSpacing: 2, color: colors.textMuted },
  editor: { marginTop: 18, fontSize: 11, fontWeight: '500', color: '#94A3B8' },

  form: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 26 },
  welcome: { fontSize: 24, fontWeight: '400', color: colors.white, lineHeight: 30 },
  welcomeSub: { marginTop: 8, marginBottom: 18, fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 10,
  },
  fieldIcon: { fontSize: 15 },
  input: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },

  error: { color: '#FECACA', marginTop: 6, marginBottom: 2, fontSize: 13 },

  button: {
    marginTop: 12,
    backgroundColor: colors.amber,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
