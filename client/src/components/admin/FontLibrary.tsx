import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import { applyUploadedFonts, type UploadedFont, type UploadedFontKind } from '../../lib/uploadedFonts';
import { fontStack } from '../product/LivePreview';
import { AdminCard } from './AdminKit';

const KINDS: { value: UploadedFontKind; label: string }[] = [
  { value: 'script', label: 'Script / handwriting' },
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'display', label: 'Display' },
];

/**
 * The studio's own lettering faces.
 *
 * Upload a font file once and it can be chosen as the lettering on any
 * product -- today's and every one added later -- and offered to customers as
 * a lettering choice. Each face carries a kind, which picks the built-in face
 * shown for the moment it takes the file to load.
 */
export function FontLibrary() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [family, setFamily] = useState('');
  const [sample, setSample] = useState('Khushbu  A-54');
  // Removing asks twice, on the button itself, rather than in a browser dialog.
  const [confirming, setConfirming] = useState<string | null>(null);

  const fonts = useQuery({
    queryKey: ['admin-fonts'],
    queryFn: () => api.get<UploadedFont[]>('/admin/fonts'),
  });

  const settle = (list: UploadedFont[]) => {
    applyUploadedFonts(list);
    queryClient.setQueryData(['admin-fonts'], list);
    void queryClient.invalidateQueries({ queryKey: ['site-settings'] });
  };
  const fail = (error: unknown) =>
    push(error instanceof ApiError ? error.message : 'That did not work — try again.', 'error');

  const add = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      if (family.trim()) form.append('family', family.trim());
      return api.upload<UploadedFont[]>('/admin/fonts', form);
    },
    onSuccess: (list) => {
      settle(list);
      setFamily('');
      push('Font added. Choose it as the lettering on any product.', 'success');
    },
    onError: fail,
    onSettled: () => { if (fileRef.current) fileRef.current.value = ''; },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { label?: string; kind?: string } }) =>
      api.patch<UploadedFont[]>(`/admin/fonts/${id}`, patch),
    onSuccess: settle,
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<UploadedFont[]>(`/admin/fonts/${id}`),
    onSuccess: (list) => { settle(list); push('Font removed.', 'success'); },
    onError: fail,
  });

  const list = fonts.data ?? [];

  // The shop's settings can lag a minute behind an upload; this list cannot, so it declares the faces itself.
  useEffect(() => {
    if (fonts.data) applyUploadedFonts(fonts.data);
  }, [fonts.data]);

  return (
    <AdminCard
      title="Lettering fonts"
      description="Upload a font file once and use it on any product, now or later. Products set in it show the real face to every customer."
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block">
            <span className="field-label">Name (optional)</span>
            <input
              className="field mt-1 w-full"
              value={family}
              placeholder="Read from the file — e.g. Yustine Signature"
              onChange={(e) => setFamily(e.target.value)}
            />
          </label>
          <label className="inline-flex cursor-pointer items-center justify-center bg-ink px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-paper hover:bg-ink-700">
            {add.isPending ? 'Uploading…' : 'Upload font file'}
            <input
              ref={fileRef}
              type="file"
              accept=".woff2,.woff,.ttf,.otf"
              className="sr-only"
              disabled={add.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) add.mutate(file);
              }}
            />
          </label>
        </div>
        <p className="text-2xs leading-relaxed text-ink-400">
          WOFF2, WOFF, TTF or OTF. Use a font you are licensed to use on a website — a desktop
          licence often does not cover it. Uploading a face with the same name again replaces it
          everywhere.
        </p>

        {list.length ? (
          <>
            <label className="block">
              <span className="field-label">Sample words</span>
              <input className="field mt-1 w-full" value={sample} onChange={(e) => setSample(e.target.value)} />
            </label>
            <ul className="divide-y divide-stone-line border border-stone-line">
              {list.map((font) => (
                <li key={font.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-2xl leading-tight text-ink" style={{ fontFamily: fontStack(font.family) }}>
                      {sample || font.family}
                    </p>
                    <input
                      className="field mt-2 w-full text-xs"
                      defaultValue={font.label}
                      aria-label={`Name shown for ${font.family}`}
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (label && label !== font.label) update.mutate({ id: font.id, patch: { label } });
                      }}
                    />
                    <p className="mt-1 text-2xs text-ink-400">
                      Products name it as “{font.family}”.
                    </p>
                  </div>
                  <label className="block">
                    <span className="field-label">Looks like</span>
                    <select
                      className="field mt-1 w-full"
                      value={font.kind}
                      onChange={(e) => update.mutate({ id: font.id, patch: { kind: e.target.value } })}
                    >
                      {KINDS.map((kind) => (
                        <option key={kind.value} value={kind.value}>{kind.label}</option>
                      ))}
                    </select>
                  </label>
                  {confirming === font.id ? (
                    <div className="space-y-1 text-2xs text-ink-500">
                      <p>Products set in it go back to the nearest built-in face.</p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className="text-xs text-red-700 underline underline-offset-2"
                          disabled={remove.isPending}
                          onClick={() => { remove.mutate(font.id); setConfirming(null); }}
                        >
                          Yes, remove
                        </button>
                        <button type="button" className="text-xs underline underline-offset-2" onClick={() => setConfirming(null)}>
                          Keep
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="justify-self-start text-xs text-red-700 underline underline-offset-2 hover:text-red-900"
                      onClick={() => setConfirming(font.id)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : fonts.isLoading ? null : (
          <p className="border border-dashed border-stone-line p-4 text-xs text-ink-400">
            No fonts uploaded yet. The built-in faces are always available.
          </p>
        )}
      </div>
    </AdminCard>
  );
}
