import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Anneau de progression — transposition du `Donut` du portail élève, qui
 * utilise un `conic-gradient` CSS. En React Native on obtient le même rendu
 * avec un cercle SVG et un `strokeDasharray`.
 */
export function Donut({
  pct,
  color,
  center,
  label,
  size = 88,
}: {
  pct: number;
  color: string;
  center: string;
  label: string;
  size?: number;
}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * circumference;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Piste de fond */}
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="#E6E9F5" strokeWidth={stroke} fill="none" />
          {/* Arc rempli — départ à midi via la rotation. */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.center}>
          <Text style={styles.value}>{center}</Text>
        </View>
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Couleur d'une moyenne /20 — mêmes seuils que le portail élève. */
export function avgColor(avg: number | null): string {
  if (avg === null) return '#CBD5E1';
  return avg < 10 ? '#DC2626' : avg < 14 ? '#D97706' : colors.brand;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, width: 92 },
  // `StyleSheet.absoluteFillObject` a disparu des types RN 0.86 (SDK 57).
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 14, fontWeight: '800', color: colors.text },
  label: { fontSize: 11, lineHeight: 14, color: colors.textMuted, textAlign: 'center' },
});

/**
 * Anneaux concentriques — une matière, une moyenne par période. Le trimestre
 * le plus ancien occupe l'anneau extérieur ; on lit donc la progression de
 * l'extérieur vers l'intérieur. Chaque anneau garde le code couleur des
 * moyennes (rouge < 10, orange < 14, vert au-delà) : la couleur dit le niveau,
 * la position dit la période.
 */
export function MultiDonut({
  values,
  center,
  label,
  size = 88,
}: {
  /** Moyennes /20 par période, dans l'ordre chronologique. */
  values: (number | null)[];
  center: string;
  label: string;
  size?: number;
}) {
  const rings = values.length || 1;
  const stroke = rings >= 3 ? 7 : rings === 2 ? 8 : 9;
  const gap = 3;
  const step = stroke + gap;
  const outerR = (size - stroke) / 2;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {values.map((v, i) => {
            const r = outerR - i * step;
            if (r <= stroke) return null;
            const circumference = 2 * Math.PI * r;
            const filled = v === null ? 0 : (Math.max(0, Math.min(20, v)) / 20) * circumference;
            return (
              <React.Fragment key={i}>
                <Circle cx={size / 2} cy={size / 2} r={r} stroke="#E6E9F5" strokeWidth={stroke} fill="none" />
                {v !== null && (
                  <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={avgColor(v)}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${filled} ${circumference - filled}`}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </Svg>
        <View style={styles.center}>
          <Text style={styles.value}>{center}</Text>
        </View>
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}
