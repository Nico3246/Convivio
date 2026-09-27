import { useEffect, useRef, useState } from 'react';
import { AppState, Image } from 'react-native';
import { Button, Copy, ErrorText, Row, Section, QueryState } from '../../components/ui';
import { choosePhoto, downloadPhoto, removePhoto, uploadPhoto, type Photo } from './service';
import { useCommand, useRows } from '../../services/hooks';
import { useMember } from '../auth/provider';
import { errorMessage } from '../../services/api';
import type { Row as DbRow } from '../../services/database.types';
export function usePhoto() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const ref = useRef(photo);
  useEffect(() => () => removePhoto(ref.current), []);
  return {
    photo,
    setPhoto: (value: Photo | null) => {
      removePhoto(ref.current);
      ref.current = value;
      setPhoto(value);
    },
  };
}
export function PhotoPicker({
  photo,
  onChange,
}: {
  photo: Photo | null;
  onChange: (photo: Photo | null) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const choose = async (camera: boolean) => {
    setBusy(true);
    setError('');
    try {
      const result = await choosePhoto(camera);
      if (result) onChange(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section>
      <Copy strong>Fotografía opcional</Copy>
      {photo && (
        <Image
          source={{ uri: photo.uri }}
          style={{ width: '100%', height: 180, borderRadius: 12 }}
          resizeMode="contain"
          accessibilityLabel="Fotografía seleccionada"
        />
      )}
      <Row>
        <Button title="Cámara" onPress={() => choose(true)} secondary disabled={busy} />
        <Button title="Galería" onPress={() => choose(false)} secondary disabled={busy} />
        {photo && <Button title="Quitar" secondary onPress={() => onChange(null)} />}
      </Row>
      <ErrorText message={error} />
    </Section>
  );
}
function PrivatePhoto({ item }: { item: DbRow<'attachments'> }) {
  const [uri, setUri] = useState<string | null>(null),
    [error, setError] = useState(''),
    [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') {
        setUri(null);
        setError('');
      }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    let active = true;
    if (foreground)
      void downloadPhoto(item)
        .then((data) => {
          if (active) setUri(data);
        })
        .catch(() => {
          if (active) setError('La imagen ya no está disponible o no hay conexión.');
        });
    return () => {
      active = false;
    };
  }, [item.id, item.bucket, item.object_path, foreground, item]);
  return uri ? (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: 240, borderRadius: 12 }}
      resizeMode="contain"
      accessibilityLabel="Fotografía adjunta"
    />
  ) : (
    <Copy muted>{error || 'Cargando imagen…'}</Copy>
  );
}
export function Attachments({
  kind,
  id,
  canAdd,
}: {
  kind: 'FAULT' | 'COMPLAINT' | 'EXPENSE';
  id: string;
  canAdd: boolean;
}) {
  const member = useMember(),
    command = useCommand(),
    selection = usePhoto();
  const column = kind === 'FAULT' ? 'fault_id' : kind === 'COMPLAINT' ? 'complaint_id' : 'debt_id';
  const query = useRows('attachments', { filters: [{ column, value: id }], size: 5 });
  return (
    <Section>
      <QueryState query={query}>
        {query.data?.rows
          .filter((row) => row.uploaded_at)
          .map((row) => (
            <PrivatePhoto key={row.id} item={row} />
          ))}
      </QueryState>
      {canAdd && (query.data?.count ?? 0) < 5 && (
        <>
          <PhotoPicker photo={selection.photo} onChange={selection.setPhoto} />
          {selection.photo && (
            <Button
              title="Adjuntar imagen"
              busy={command.busy}
              onPress={async () => {
                const selected = selection.photo;
                if (!selected) return;
                const ok = await command.run({ id, photo: selected.uri }, async (key) => {
                  await uploadPhoto(member.household_id, kind, id, selected, key);
                  return true;
                });
                if (ok) selection.setPhoto(null);
              }}
            />
          )}
          <ErrorText message={command.error} />
        </>
      )}
    </Section>
  );
}
