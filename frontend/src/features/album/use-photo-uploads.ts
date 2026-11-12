import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { useApi } from '@/api/api-context';
import { queryKeys } from '@/api/queries';
import { preparePhoto, type PickedPhoto } from './photo-prep';

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'failed';
export type Upload = { key: string; photo: PickedPhoto; status: UploadStatus; error?: string };

/**
 * 고른 사진을 순서대로 한 장씩 줄여서 올린다. 장마다 성공·실패를 남기고, 실패한 것만 다시 올릴 수 있다.
 */
export function usePhotoUploads(tripId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const running = useRef(false);

  const set = (key: string, change: Partial<Upload>) =>
    setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...change } : u)));

  async function run(queue: Upload[]) {
    if (running.current) return;
    running.current = true;
    try {
      for (const upload of queue) {
        set(upload.key, { status: 'uploading', error: undefined });
        try {
          const uri = await preparePhoto(upload.photo);
          await api.uploadPhoto(tripId, { uri, takenAt: upload.photo.takenAt });
          set(upload.key, { status: 'done' });
        } catch (e) {
          set(upload.key, { status: 'failed', error: e instanceof Error ? e.message : '올리지 못했어요.' });
        }
      }
    } finally {
      running.current = false;
      await queryClient.invalidateQueries({ queryKey: queryKeys.photos(tripId) });
    }
  }

  function start(photos: PickedPhoto[]) {
    const known = new Set(uploads.filter((u) => u.status !== 'failed').map((u) => u.key));
    const queue = photos.filter((p) => !known.has(p.key)).map((photo) => ({ key: photo.key, photo, status: 'waiting' as const }));
    setUploads(queue);
    void run(queue);
  }

  function retryFailed() {
    const queue = uploads.filter((u) => u.status === 'failed');
    void run(queue);
  }

  return {
    uploads,
    busy: uploads.some((u) => u.status === 'waiting' || u.status === 'uploading'),
    start,
    retryFailed,
    clear: () => setUploads([]),
  };
}
