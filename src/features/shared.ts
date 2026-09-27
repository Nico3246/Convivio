import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useMembers, useRows } from '../services/hooks';
import type { Relation } from '../services/database.types';
import { AppError, errorMessage } from '../services/api';
import { parseEuroCents } from '../domain/money';
import { uploadPhoto, type Photo } from './photos/service';

export function useParam(name: string): string {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const value = params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
export function useId() {
  const id = useParam('id');
  return z.uuid().safeParse(id).success ? id : '00000000-0000-4000-8000-000000000000';
}
export function useDetail<T extends Exclude<Relation, 'members'>>(table: T, id: string) {
  return useRows(table, { filters: [{ column: 'id', value: id }], order: 'id', size: 1 });
}
export function usePeople() {
  const query = useMembers();
  const all = query.data ?? [];
  return {
    query,
    all,
    residents: all.filter((m) => m.role !== 'CONTROLLER'),
    name: (id: string | null | undefined) =>
      all.find((m) => m.id === id)?.display_name ?? 'Cuenta no disponible',
  };
}
export function required(value: string, label: string, max = 5000) {
  const v = value.trim();
  if (!v || v.length > max) throw new AppError(`${label}: introduce entre 1 y ${max} caracteres.`);
  return v;
}
export function money(value: string, allowZero = false) {
  try {
    const cents = parseEuroCents(value);
    if (!allowZero && cents === 0) throw new Error('El importe debe ser mayor que cero');
    return cents;
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : 'Importe no válido');
  }
}
export const categories = [
  { value: 'HOURS', label: 'Horarios' },
  { value: 'VISITS', label: 'Visitas' },
  { value: 'COMMON_AREAS', label: 'Espacios' },
] as const;
export const scopes = [
  { value: 'PERSONAL', label: 'Mi comida' },
  { value: 'SHARED', label: 'Compartido' },
  { value: 'HOUSEHOLD', label: 'Hogar' },
] as const;
export const decisionName = (value: string | null) =>
  value === 'APPROVED' ? 'Aprobada' : value === 'REJECTED' ? 'Rechazada' : 'Pendiente';
export const visitKinds = [
  { value: 'LATE_VISIT', label: 'Después de las 21:30' },
  { value: 'OVERNIGHT', label: 'Quedarse a dormir' },
  { value: 'BOTH', label: 'Ambas cosas' },
] as const;
export async function optionalPhoto(
  household: string,
  kind: 'FAULT' | 'COMPLAINT' | 'EXPENSE',
  id: string,
  photo: Photo | null,
) {
  if (photo)
    try {
      await uploadPhoto(household, kind, id, photo, Crypto.randomUUID());
    } catch (error) {
      Alert.alert(
        'Registro guardado',
        errorMessage(error) + ' Puedes adjuntar la fotografía desde el detalle.',
      );
    }
}
