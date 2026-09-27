import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Copy, Heading, Icon, Section } from '../../components/ui';
import { useReducedMotion } from '../../components/motion';
import { displayDay, shiftDay, weekday } from '../../domain/dates';
import { useTheme } from '../../theme/provider';
import {
  calendarDays,
  startOfWeek,
  weekLabel,
  type CalendarEntry,
  type CalendarShower,
  type CalendarTask,
} from './calendar-model';

type Props = {
  start: string;
  today: string;
  tasks: CalendarTask[];
  showers: CalendarShower[];
  name: (id: string) => string;
  onChangeWeek: (start: string) => void;
  renderTask: (task: CalendarTask) => ReactNode;
};

function EventCard({
  entry,
  name,
  onPress,
}: {
  entry: CalendarEntry;
  name: Props['name'];
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const dark = theme.background === '#0F172A';
  const shower = entry.kind === 'shower';
  const done = entry.kind === 'task' && !!entry.task.completed_at;
  const title = entry.kind === 'task' ? entry.task.title : 'Ducha';
  const person = name(entry.kind === 'task' ? entry.task.assigned_to : entry.shower.resident_id);
  const time =
    entry.kind === 'shower'
      ? `${entry.time}–${entry.shower.ends_at.slice(0, 5)}`
      : (entry.time ?? 'Sin hora');
  const accent = shower
    ? dark
      ? '#5EEAD4'
      : '#0F766E'
    : done
      ? theme.success
      : dark
        ? '#C7D2FE'
        : theme.primary;
  const background = shower ? (dark ? '#16353B' : '#E6F6F6') : done ? theme.card : theme.soft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${displayDay(entry.day)}. ${time}. ${person}.${done ? ' Realizada.' : !shower ? ' Pendiente.' : ''}`}
      accessibilityHint="Abrir detalle"
      onPress={onPress}
      style={({ pressed }) => [
        styles.event,
        { backgroundColor: background, borderLeftColor: accent, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.time, { color: accent }]}>{time}</Text>
      <Text numberOfLines={2} style={[styles.eventTitle, { color: theme.text }]}>
        {title}
      </Text>
      <Text numberOfLines={2} style={[styles.person, { color: theme.secondary }]}>
        {person}
      </Text>
      {entry.kind === 'task' && (
        <View style={styles.status}>
          <Icon name={done ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={accent} />
          <Text style={[styles.person, { color: accent }]}>{done ? 'Realizada' : 'Pendiente'}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function WeeklyCalendar({
  start,
  today,
  tasks,
  showers,
  name,
  onChangeWeek,
  renderTask,
}: Props) {
  const { theme } = useTheme();
  const ink = theme.background === '#0F172A' ? '#C7D2FE' : theme.primary;
  const reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const days = useMemo(() => calendarDays(start, tasks, showers), [start, tasks, showers]);
  const column = Math.max(
    Math.round(136 * Math.min(Math.max(fontScale, 1), 1.5)),
    Math.floor(width / 7),
  );
  const horizon = shiftDay(today, 14);
  const last = shiftDay(start, 6);
  const selectedEntry = days
    .flatMap((day) => [...day.untimed, ...day.timed])
    .find((entry) => entry.key === selected);
  const hasUntimed = days.some((day) => day.untimed.length > 0);
  useEffect(() => {
    if (width === 0) return;
    const index = today >= start && today <= last ? Math.max(0, weekday(today) - 2) : 0;
    scroll.current?.scrollTo({ x: index * column, animated: false });
  }, [start, today, last, width, column]);
  const changeWeek = (day: string) => {
    setSelected(null);
    onChangeWeek(day);
  };
  const goToday = () => {
    changeWeek(startOfWeek(today));
    if (start === startOfWeek(today))
      scroll.current?.scrollTo({ x: Math.max(0, weekday(today) - 2) * column, animated: !reduced });
  };
  const border = { borderColor: theme.border };
  return (
    <Section>
      <View style={[styles.panel, border, { backgroundColor: theme.card }]}>
        <View style={styles.navigation}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Semana anterior"
            onPress={() => changeWeek(shiftDay(start, -7))}
            style={styles.arrow}
          >
            <Icon name="chevron-back" color={ink} />
          </Pressable>
          <Text accessibilityRole="header" style={[styles.weekTitle, { color: theme.text }]}>
            {weekLabel(start)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Semana siguiente"
            accessibilityState={{ disabled: shiftDay(start, 7) > horizon }}
            disabled={shiftDay(start, 7) > horizon}
            onPress={() => changeWeek(shiftDay(start, 7))}
            style={[styles.arrow, { opacity: shiftDay(start, 7) > horizon ? 0.35 : 1 }]}
          >
            <Icon name="chevron-forward" color={ink} />
          </Pressable>
        </View>
        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            onPress={goToday}
            style={[styles.todayButton, { backgroundColor: theme.soft }]}
          >
            <Icon name="calendar-outline" size={17} color={ink} />
            <Text style={{ color: ink, fontSize: 14, fontWeight: '600' }}>Hoy</Text>
          </Pressable>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: theme.primary }]} />
              <Copy muted>Tareas</Copy>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#0D9488' }]} />
              <Copy muted>Duchas</Copy>
            </View>
          </View>
        </View>
        {width < column * 7 && (
          <Text style={[styles.hint, { color: theme.secondary }]}>
            Desliza para ver los siete días · Toca un evento
          </Text>
        )}
        <ScrollView
          horizontal
          ref={scroll}
          showsHorizontalScrollIndicator
          nestedScrollEnabled
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ width: column * 7 }}
        >
          <View style={{ width: column * 7 }}>
            <View style={styles.weekRow}>
              {days.map((day) => (
                <View
                  key={day.day}
                  style={[
                    styles.dayHeader,
                    border,
                    {
                      width: column,
                      backgroundColor: day.day === today ? theme.soft : theme.background,
                    },
                  ]}
                >
                  <Text style={{ color: theme.secondary, fontSize: 13 }}>{day.label}</Text>
                  <View
                    style={[
                      styles.dateCircle,
                      { backgroundColor: day.day === today ? theme.primary : 'transparent' },
                    ]}
                  >
                    <Text
                      style={{
                        color: day.day === today ? theme.onPrimary : theme.text,
                        fontSize: 21,
                        fontWeight: '700',
                      }}
                    >
                      {Number(day.day.slice(8))}
                    </Text>
                  </View>
                  {day.day === today && (
                    <Text style={{ color: ink, fontSize: 11, fontWeight: '600' }}>HOY</Text>
                  )}
                </View>
              ))}
            </View>
            {hasUntimed && (
              <>
                <View style={styles.weekRow}>
                  {days.map((day) => (
                    <View
                      key={day.day}
                      style={[
                        styles.groupHeading,
                        border,
                        { width: column, backgroundColor: theme.background },
                      ]}
                    >
                      <Text style={[styles.groupLabel, { color: theme.secondary }]}>SIN HORA</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.weekRow}>
                  {days.map((day) => (
                    <View key={day.day} style={[styles.dayColumn, border, { width: column }]}>
                      {day.untimed.map((entry) => (
                        <EventCard
                          key={entry.key}
                          entry={entry}
                          name={name}
                          onPress={() => setSelected(entry.key)}
                        />
                      ))}
                      {!day.untimed.length && (
                        <Text style={[styles.empty, { color: theme.secondary }]}>—</Text>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}
            <View style={styles.weekRow}>
              {days.map((day) => (
                <View
                  key={day.day}
                  style={[
                    styles.groupHeading,
                    border,
                    { width: column, backgroundColor: theme.background },
                  ]}
                >
                  <Text style={[styles.groupLabel, { color: theme.secondary }]}>CON HORARIO</Text>
                </View>
              ))}
            </View>
            <View style={styles.weekRow}>
              {days.map((day) => (
                <View
                  key={day.day}
                  style={[
                    styles.dayColumn,
                    border,
                    {
                      width: column,
                      minHeight: 240,
                      backgroundColor: day.day === today ? `${theme.primary}08` : 'transparent',
                    },
                  ]}
                >
                  {day.timed.map((entry) => (
                    <EventCard
                      key={entry.key}
                      entry={entry}
                      name={name}
                      onPress={() => setSelected(entry.key)}
                    />
                  ))}
                  {!day.timed.length && (
                    <Text style={[styles.empty, { color: theme.secondary }]}>
                      {day.day > horizon ? 'Por programar' : 'Sin eventos con hora'}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
      <Copy muted>
        Tareas programadas hasta {displayDay(horizon)}. Las duchas muestran el horario habitual
        vigente.
      </Copy>
      <Modal
        visible={!!selectedEntry}
        animationType={reduced ? 'none' : 'slide'}
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: theme.background }}
          accessibilityViewIsModal
        >
          <View style={[styles.modalHeader, border]}>
            <Heading>{selectedEntry ? displayDay(selectedEntry.day) : 'Detalle'}</Heading>
            <Button title="Cerrar" secondary onPress={() => setSelected(null)} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            {selectedEntry?.kind === 'task' ? (
              renderTask(selectedEntry.task)
            ) : selectedEntry?.kind === 'shower' ? (
              <Card>
                <Heading>Turno de ducha</Heading>
                <Copy>
                  {selectedEntry.shower.starts_at.slice(0, 5)}–
                  {selectedEntry.shower.ends_at.slice(0, 5)}
                </Copy>
                <Copy strong>{name(selectedEntry.shower.resident_id)}</Copy>
                <Copy muted>Horario habitual vigente.</Copy>
              </Card>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Section>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  arrow: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  weekTitle: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  toolbar: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  todayButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legend: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  hint: { paddingHorizontal: 12, paddingBottom: 12, fontSize: 12, lineHeight: 18 },
  weekRow: { flexDirection: 'row', alignItems: 'stretch' },
  dayHeader: {
    minHeight: 98,
    gap: 4,
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  dateCircle: {
    minWidth: 34,
    minHeight: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeading: {
    borderBottomWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  groupLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  dayColumn: { padding: 7, gap: 8, borderRightWidth: 1, borderBottomWidth: 1 },
  event: { minHeight: 80, padding: 9, borderRadius: 10, borderLeftWidth: 3, gap: 5 },
  time: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  eventTitle: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  person: { fontSize: 12, lineHeight: 17 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  empty: { fontSize: 12, lineHeight: 18, padding: 7 },
  modalHeader: { padding: 16, borderBottomWidth: 1, gap: 12 },
});
