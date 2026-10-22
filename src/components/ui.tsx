// Small set of shared building blocks so screens stay consistent.
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({ children, scroll = true, edges = ['bottom'] }: { children: ReactNode; scroll?: boolean; edges?: ('top' | 'bottom')[] }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.background }}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  const bg = { primary: theme.tint, secondary: theme.backgroundElement, danger: theme.danger, ghost: 'transparent' }[variant];
  const fg = variant === 'primary' ? theme.onTint : variant === 'danger' ? '#FFFFFF' : variant === 'ghost' ? theme.tint : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <ThemedText style={{ color: fg, fontWeight: 600 }}>{title}</ThemedText>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? (color ?? theme.tint) : theme.border,
          backgroundColor: selected ? (color ?? theme.tint) : theme.card,
          shadowColor: theme.shadow,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? (color ? '#FFFFFF' : theme.onTint) : (color ?? theme.text) }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
      {children}
    </ThemedText>
  );
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        {...input}
        style={[styles.input, { color: theme.text, borderColor: error ? theme.danger : theme.border, backgroundColor: theme.card }]}
      />
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function SwitchRow({ label, description, value, onValueChange, disabled }: { label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', gap: Spacing.three }}>
      <View style={{ flex: 1 }}>
        <ThemedText>{label}</ThemedText>
        {description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: theme.tint }} />
    </Row>
  );
}

export function StatusDot({ color, size = 12 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export function EmptyState({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
        {title}
      </ThemedText>
      {description ? (
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          {description}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  button: { minHeight: 52, borderRadius: Radius.pill, paddingHorizontal: Spacing.four, alignItems: 'center', justifyContent: 'center' },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.two },
  input: { borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
});
