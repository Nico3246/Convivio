import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { AppError, call } from '../../services/api';
import { supabase } from '../../services/supabase';
import type { Row } from '../../services/database.types';

export type Photo = { uri: string; width: number; height: number };
export function removePhoto(photo: Photo | null) {
  if (photo?.uri.startsWith(Paths.cache.uri)) {
    try {
      new File(photo.uri).delete();
    } catch {
      /* Cache may already be purged by Android. */
    }
  }
}
export async function choosePhoto(camera: boolean): Promise<Photo | null> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new AppError('Permite el acceso a la cámara o selecciona una imagen de la galería.');
  }
  const result = camera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], exif: false, quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        exif: false,
        quality: 1,
        selectionLimit: 1,
      });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  let output: Photo | null = null;
  try {
    for (const [width, compress] of [
      [1600, 0.75],
      [1200, 0.55],
      [900, 0.4],
    ] as const) {
      removePhoto(output);
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize({ width: Math.min(width, asset.width) });
      const image = await context.renderAsync();
      output = await image.saveAsync({ format: SaveFormat.JPEG, compress });
      image.release();
      context.release();
      if (new File(output.uri).size <= 1_048_576) return output;
    }
    removePhoto(output);
    throw new AppError('La imagen sigue siendo demasiado grande. Elige otra fotografía.');
  } finally {
    if (asset.uri !== output?.uri) removePhoto(asset);
  }
}
export async function uploadPhoto(
  household: string,
  kind: 'FAULT' | 'COMPLAINT' | 'EXPENSE',
  record: string,
  photo: Photo,
  requestId: string,
) {
  const id = await call('reserve_attachment', {
    p_household: household,
    p_kind: kind,
    p_record: record,
    p_request_id: requestId,
  });
  const result = await supabase()
    .from('attachments')
    .select('*')
    .eq('id', id)
    .eq('household_id', household)
    .single();
  if (result.error) throw result.error;
  const attachment = result.data;
  if (attachment.uploaded_at) return;
  const body = await new File(photo.uri).arrayBuffer();
  const { error } = await supabase()
    .storage.from(attachment.bucket)
    .upload(attachment.object_path, body, {
      contentType: 'image/jpeg',
      cacheControl: '0',
      upsert: false,
    });
  if (error && (!('statusCode' in error) || String(error.statusCode) !== '409'))
    throw new AppError(
      'El registro está guardado, pero no se ha podido subir la imagen. Puedes volver a adjuntarla desde el detalle.',
    );
  await call('finish_attachment', { p_household: household, p_attachment: id });
}
export async function downloadPhoto(attachment: Row<'attachments'>): Promise<string> {
  const { data, error } = await supabase()
    .storage.from(attachment.bucket)
    .download(attachment.object_path);
  if (error) throw error;
  if (data.size > 1_048_576) throw new AppError('No se puede mostrar esta imagen.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new AppError('Imagen no disponible'));
    reader.onerror = () => reject(new AppError('Imagen no disponible'));
    reader.readAsDataURL(data);
  });
}
