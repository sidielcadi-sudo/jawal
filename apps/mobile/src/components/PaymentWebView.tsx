import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { API_URL } from '../config';
import { api, type PayInit } from '../api';
import { colors } from '../theme';

/** Échappe une valeur pour un attribut HTML. */
function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Page HTML qui auto-soumet le formulaire signé vers la passerelle CMI. */
function buildAutoSubmit(init: PayInit): string {
  const inputs = Object.entries(init.fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeAttr(k)}" value="${escapeAttr(v)}">`)
    .join('');
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:sans-serif;display:flex;height:100vh;margin:0;align-items:center;justify-content:center;color:#64748B}</style>
</head><body onload="document.forms[0].submit()">
<form method="post" action="${escapeAttr(init.action)}">${inputs}</form>
<p>Redirection vers la page de paiement sécurisée…</p></body></html>`;
}

const RETURN_URL = `${API_URL}/api/payments/cmi/return`;

type Phase = 'paying' | 'checking' | 'result';

/**
 * Tunnel de paiement CMI : ouvre la page de paiement dans un WebView, intercepte
 * l'URL de retour, puis interroge le statut de la commande (source de vérité =
 * callback serveur signé, éventuellement avec un léger délai).
 */
export function PaymentWebView({
  init,
  token,
  onClose,
}: {
  init: PayInit;
  token: string;
  onClose: (paid: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const html = useMemo(() => buildAutoSubmit(init), [init]);
  const [phase, setPhase] = useState<Phase>('paying');
  const [paid, setPaid] = useState(false);
  const polling = useRef(false);

  const startPolling = async () => {
    if (polling.current) return;
    polling.current = true;
    setPhase('checking');
    // Le callback peut arriver avec un léger décalage : on interroge ~10×.
    for (let i = 0; i < 10; i++) {
      try {
        const s = await api.paymentStatus(token, init.orderId);
        if (s.status !== 'PENDING') {
          setPaid(s.status === 'PAID');
          setPhase('result');
          return;
        }
      } catch {
        /* on réessaie */
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    // Toujours en attente : on considère non confirmé (le parent pourra rafraîchir).
    setPaid(false);
    setPhase('result');
  };

  const onNav = (nav: WebViewNavigation) => {
    if (nav.url.startsWith(RETURN_URL)) startPolling();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={() => onClose(paid)}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.barTitle}>Paiement · {init.amount.toLocaleString('fr-FR')} MAD</Text>
        <TouchableOpacity onPress={() => onClose(paid)} hitSlop={10}>
          <Text style={styles.close}>Fermer</Text>
        </TouchableOpacity>
      </View>

      {phase === 'result' ? (
        <View style={styles.center}>
          <Text style={styles.resultIcon}>{paid ? '✅' : '⏳'}</Text>
          <Text style={styles.resultTitle}>{paid ? 'Paiement confirmé' : 'Paiement non confirmé'}</Text>
          <Text style={styles.resultBody}>
            {paid
              ? 'Votre règlement a bien été enregistré. Merci.'
              : 'Nous n’avons pas encore reçu la confirmation. Si le montant a été débité, il sera pris en compte sous peu.'}
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => onClose(paid)}>
            <Text style={styles.doneBtnText}>Terminer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            source={{ html, baseUrl: init.action }}
            onNavigationStateChange={onNav}
            onShouldStartLoadWithRequest={(r) => {
              if (r.url.startsWith(RETURN_URL)) {
                startPolling();
                return false; // n'ouvre pas la page web (auth requise) : on poll le statut
              }
              return true;
            }}
            startInLoadingState
          />
          {phase === 'checking' && (
            <View style={styles.overlay}>
              <ActivityIndicator color={colors.brand} size="large" />
              <Text style={styles.overlayText}>Vérification du paiement…</Text>
            </View>
          )}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.brand,
  },
  barTitle: { color: colors.white, fontSize: 15, fontWeight: '800' },
  close: { color: colors.white, fontSize: 14, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.bg },
  resultIcon: { fontSize: 56, marginBottom: 12 },
  resultTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8 },
  resultBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  doneBtn: { marginTop: 28, backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 },
  doneBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  overlay: {
    // `StyleSheet.absoluteFillObject` a disparu des types RN 0.86 (SDK 57).
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(248,249,251,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: { marginTop: 12, color: colors.textMuted, fontWeight: '600' },
});
