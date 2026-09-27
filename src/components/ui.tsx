import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { ComponentProps, ReactNode } from 'react';
import { useTheme } from '../theme/provider';
import { BrandLogo } from './brand-logo';
import { useAuth } from '../features/auth/provider';
import { displayDay, displayInstant, localDateTime, dateOnly, timeOnly } from '../domain/dates';
import { errorMessage } from '../services/api';
import type { ScreenName } from '../domain/navigation';

export function go(screen: ScreenName, params: Record<string, string> = {}, replace = false) {
  const query = new URLSearchParams(params).toString();
  const href = `/${screen}${query ? '?' + query : ''}` as Href;
  if (replace) router.replace(href);
  else router.push(href);
}
export function Icon({
  name,
  size = 22,
  color,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  size?: number;
  color?: string;
}) {
  const { theme } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? theme.primary} accessible={false} />;
}
export function Copy({
  children,
  muted = false,
  strong = false,
  tone,
}: {
  children: ReactNode;
  muted?: boolean;
  strong?: boolean;
  tone?: 'danger' | 'success';
}) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        fontSize: 15,
        lineHeight: 22,
        color: tone ? theme[tone] : muted ? theme.secondary : theme.text,
        fontWeight: strong ? '600' : '400',
      }}
    >
      {children}
    </Text>
  );
}
export function Heading({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '600', color: theme.text }}>
      {children}
    </Text>
  );
}
export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  const look = [styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={look}>
      {children}
    </Pressable>
  ) : (
    <View style={look}>{children}</View>
  );
}
export function Row({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      {children}
    </View>
  );
}
export function Section({ children }: { children: ReactNode }) {
  return <View style={{ gap: 14 }}>{children}</View>;
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 14,
        backgroundColor: danger ? theme.dangerBackground : theme.soft,
        gap: 8,
      }}
    >
      <Copy tone={danger ? 'danger' : undefined}>{children}</Copy>
    </View>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        alignSelf: 'flex-start',
        borderRadius: 7,
        paddingHorizontal: 8,
        paddingVertical: 5,
        fontSize: 12,
        color: theme.warning,
        backgroundColor: theme.warningBackground,
      }}
    >
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  busy = false,
  secondary = false,
  danger = false,
}: {
  title: string;
  onPress: () => unknown;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={() => {
        void onPress();
      }}
      style={{
        minHeight: 48,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: secondary ? theme.card : danger ? theme.dangerButton : theme.primary,
        borderWidth: secondary ? 1 : 0,
        borderColor: theme.border,
        opacity: disabled || busy ? 0.5 : 1,
        flexDirection: 'row',
        gap: 10,
      }}
    >
      {busy && <ActivityIndicator color={secondary ? theme.primary : theme.onPrimary} />}
      <Text
        style={{
          fontSize: 16,
          fontWeight: '600',
          textAlign: 'center',
          color: secondary ? theme.text : theme.onPrimary,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Copy strong>{label}</Copy>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.secondary}
        {...props}
        style={[
          {
            fontSize: 16,
            color: theme.text,
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 12,
            minHeight: 48,
            padding: 13,
            textAlignVertical: props.multiline ? 'top' : 'center',
          },
          props.multiline ? { minHeight: 100 } : null,
          props.style,
        ]}
      />
    </View>
  );
}
export function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {label && <Copy strong>{label}</Copy>}
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
      >
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: option.value === value }}
            onPress={() => onChange(option.value)}
            style={{
              minHeight: 44,
              justifyContent: 'center',
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: option.value === value ? theme.primary : theme.border,
              backgroundColor: option.value === value ? theme.soft : theme.card,
            }}
          >
            <Copy>{option.label}</Copy>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 }}
    >
      <Icon name={value ? 'checkbox' : 'square-outline'} />
      <Copy>{label}</Copy>
    </Pressable>
  );
}
export function DateField({
  label,
  value,
  onChange,
  mode = 'datetime',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: 'date' | 'time' | 'datetime';
}) {
  const date =
    mode === 'date'
      ? localDateTime(value)
      : mode === 'time'
        ? localDateTime(dateOnly(), value)
        : new Date(value);
  const pick = (part: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value: date,
      mode: part,
      is24Hour: true,
      timeZoneName: 'Europe/Madrid',
      onChange: (event, selected) => {
        if (event.type === 'set' && selected)
          onChange(
            mode === 'date'
              ? dateOnly(selected)
              : mode === 'time'
                ? timeOnly(selected)
                : selected.toISOString(),
          );
      },
    });
  return (
    <Section>
      <Copy strong>{label}</Copy>
      <Copy>
        {mode === 'date' ? displayDay(value) : mode === 'time' ? value : displayInstant(value)}
      </Copy>
      <Row>
        {mode !== 'time' && <Button title="Elegir fecha" secondary onPress={() => pick('date')} />}
        {mode !== 'date' && <Button title="Elegir hora" secondary onPress={() => pick('time')} />}
      </Row>
      {mode === 'datetime' && <Copy muted>Hora de Madrid</Copy>}
    </Section>
  );
}
export function ErrorText({ message }: { message: string }) {
  const { theme } = useTheme();
  return message ? (
    <Text accessibilityRole="alert" style={{ fontSize: 15, lineHeight: 22, color: theme.danger }}>
      {message}
    </Text>
  ) : null;
}
export function Empty({ text = 'Todavía no hay registros.' }: { text?: string }) {
  return (
    <Card>
      <Copy muted>{text}</Copy>
    </Card>
  );
}
export function Loading() {
  const { theme } = useTheme();
  return (
    <View style={{ padding: 24 }}>
      <ActivityIndicator color={theme.primary} accessibilityLabel="Cargando" />
    </View>
  );
}
export function QueryState({
  query,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  children: ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <Section>
        <ErrorText message={errorMessage(query.error)} />
        <Button title="Volver a intentar" onPress={query.refetch} secondary />
      </Section>
    );
  return <>{children}</>;
}
export function Pager({
  page,
  count,
  onChange,
  size = 40,
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
  size?: number;
}) {
  if (count <= size) return null;
  return (
    <Row>
      <Button title="Anterior" secondary disabled={page === 0} onPress={() => onChange(page - 1)} />
      <Copy>
        {page + 1} / {Math.ceil(count / size)}
      </Copy>
      <Button
        title="Siguiente"
        secondary
        disabled={(page + 1) * size >= count}
        onPress={() => onChange(page + 1)}
      />
    </Row>
  );
}
const residentTabs = [
  ['home', 'Inicio', 'home-outline'],
  ['coexistence', 'Convivencia', 'shield-checkmark-outline'],
  ['house', 'Casa', 'calendar-outline'],
  ['shopping', 'Compra', 'cart-outline'],
  ['money', 'Dinero', 'wallet-outline'],
] as const;
const controllerTabs = [
  ['home', 'Resumen', 'grid-outline'],
  ['faults', 'Faltas', 'warning-outline'],
  ['complaints', 'Quejas', 'chatbubble-outline'],
  ['visits', 'Excepciones', 'calendar-outline'],
] as const;
export function Shell({
  title,
  subtitle,
  children,
  back = false,
  active = 'home',
  refresh,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
  active?: ScreenName;
  refresh?: () => unknown;
}) {
  const { theme } = useTheme();
  const { member } = useAuth();
  const tabs = member?.role === 'CONTROLLER' ? controllerTabs : residentTabs;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          backgroundColor: theme.card,
          borderBottomWidth: 1,
          borderColor: theme.border,
        }}
      >
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => (router.canGoBack() ? router.back() : go('home', {}, true))}
            style={styles.iconButton}
          >
            <Icon name="arrow-back" />
          </Pressable>
        )}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BrandLogo size={28} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text, flexShrink: 1 }}>
            Convivio
          </Text>
        </View>
        {member && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notificaciones"
              onPress={() => go('notifications')}
              style={styles.iconButton}
            >
              <Icon name="notifications-outline" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Perfil"
              onPress={() => go('profile')}
              style={styles.iconButton}
            >
              <Icon name="person-circle-outline" size={28} />
            </Pressable>
          </>
        )}
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 32 }}
          refreshControl={
            refresh ? (
              <RefreshControl
                refreshing={false}
                onRefresh={() => {
                  void refresh();
                }}
                tintColor={theme.primary}
              />
            ) : undefined
          }
        >
          <View style={{ gap: 8 }}>
            <Text
              accessibilityRole="header"
              style={{ fontSize: 26, fontWeight: '700', color: theme.text }}
            >
              {title}
            </Text>
            {subtitle && <Copy muted>{subtitle}</Copy>}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      {member && !back && (
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.card,
            borderTopWidth: 1,
            borderColor: theme.border,
            paddingVertical: 8,
          }}
        >
          {tabs.map(([screen, label, icon]) => (
            <Pressable
              key={screen}
              accessibilityRole="tab"
              accessibilityState={{ selected: screen === active }}
              accessibilityLabel={label}
              onPress={() => go(screen, {}, true)}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                minHeight: 52,
                paddingHorizontal: 2,
              }}
            >
              <Icon
                name={icon}
                size={21}
                color={screen === active ? theme.primary : theme.secondary}
              />
              <Text
                style={{
                  fontSize: 11,
                  color: screen === active ? theme.primary : theme.secondary,
                  fontWeight: screen === active ? '600' : '400',
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
