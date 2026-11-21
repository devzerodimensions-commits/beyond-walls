import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { PLATE_FONTS, fontStack } from '../product/LivePreview';
import { ApiError, api } from '../../lib/api';
import { useSettings, useToast } from '../../context/StoreProvider';
import { applyUploadedFonts, parseUploadedFonts, type UploadedFont } from '../../lib/uploadedFonts';
import { Spinner, UploadIcon } from '../ui';

/**
 * Choosing the face the preview letters a plate in.
 *
 * This was a text box with a hidden datalist, so picking the right face meant
 * knowing to type "formal-script". A shopkeeper uploading a photograph of a
 * plate cut in a flowing script had no way to discover that the word existed,
 * and the preview went on drawing their piece in a plain sans -- the single
 * most obvious way a preview can fail to look like the product it is for.
 *
 * So the faces are shown rather than named: each tile is set in the face it
 * offers, which is the only description of a typeface anybody needs. The text
 * box is still here, folded away, because a studio with a licensed house font
 * can still name its own stack.
 *
 * A photograph carries no typeface -- there is no reading it off the picture
 * -- so this stays a choice somebody makes by eye. Showing the faces is what
 * makes that choice take a second.
 */
export function FontChoice({
  value, fallback, onChange,
}: {
  /** The product's own setting. Empty means it follows the design. */
  value: string;
  /** What the design uses when the product says nothing. */
  fallback: string;
  onChange: (value: string) => void;
}) {
  const { get } = useSettings();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  /*
   * The studio's own faces.
   *
   * Read from the shop's settings so the tiles draw in the real face, and
   * fetched again here because this is where they are added and taken away:
   * a face uploaded a moment ago has to appear at once, not when the shop's
   * settings next refresh.
   */
  const library = useQuery({
    queryKey: ['admin-fonts'],
    queryFn: () => api.get<UploadedFont[]>('/admin/fonts'),
  });
  const uploaded = library.data ?? parseUploadedFonts(get<unknown>('preview.fonts', []));
  const known = PLATE_FONTS.some((face) => face.id === value)
    || uploaded.some((face) => face.family === value);
  const [custom, setCustom] = useState(() => value !== '' && !known);

  const fallbackLabel = PLATE_FONTS.find((f) => f.id === fallback)?.label ?? fallback;

  const settle = (list: UploadedFont[]) => {
    applyUploadedFonts(list);
    queryClient.setQueryData(['admin-fonts'], list);
    void queryClient.invalidateQueries({ queryKey: ['site-settings'] });
  };
  const fail = (error: unknown) =>
    push(error instanceof ApiError ? error.message : 'That did not work — try again.', 'error');

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<UploadedFont[]>('/admin/fonts', form);
    },
    onSuccess: (list) => {
      settle(list);
      push('Font added — it can be used on any product.', 'success');
    },
    onError: fail,
    onSettled: () => { if (fileRef.current) fileRef.current.value = ''; },
  });

  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api.patch<UploadedFont[]>(`/admin/fonts/${id}`, { label }),
    onSuccess: (list) => { settle(list); setEditing(null); },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<UploadedFont[]>(`/admin/fonts/${id}`),
    onSuccess: (list, id) => {
      const gone = uploaded.find((face) => face.id === id);
      settle(list);
      setRemoving(null);
      /*
       * A product set in a face that has just gone would letter its plate in
       * a stand-in and say nothing, so it goes back to the design's own face
       * where the studio can see the change and choose again.
       */
      if (gone && value === gone.family) onChange('');
      push('Font removed.', 'success');
    },
    onError: fail,
  });

  return (
    <div className="sm:col-span-2">
      <p className="field-label">Lettering</p>
      {/*
        * What this setting now is.
        *
        * It used to be the answer to "which face was this cut in?", which a
        * photograph cannot say and nobody could check. Customers choose their
        * own lettering now, so this is the face their plate STARTS on -- the
        * one closest to the piece in the photograph, and the one most of them
        * will leave alone.
        */}
      <p className="mb-2 mt-1 text-2xs leading-relaxed text-ink-400">
        The face this product’s preview starts on. Pick the one closest to the real piece — a
        photograph cannot tell us which it was cut in. Customers can change it from the
        “Lettering” question under Personalisation, and the plate follows as they do.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => { setCustom(false); onChange(''); }}
          className={clsx(
            'border px-3 py-2.5 text-left transition-colors',
            value === '' && !custom
              ? 'border-ink bg-paper-off'
              : 'border-stone-line hover:border-ink-300',
          )}
        >
          <span className="block text-sm leading-tight text-ink" style={{ fontFamily: fontStack(fallback) }}>
            Abhay 104
          </span>
          <span className="mt-1 block text-2xs text-ink-400">
            From the design ({fallbackLabel})
          </span>
        </button>

        {PLATE_FONTS.map((face) => (
          <button
            key={face.id}
            type="button"
            onClick={() => { setCustom(false); onChange(face.id); }}
            title={face.note}
            className={clsx(
              'border px-3 py-2.5 text-left transition-colors',
              value === face.id && !custom
                ? 'border-ink bg-paper-off'
                : 'border-stone-line hover:border-ink-300',
            )}
          >
            <span className="block text-sm leading-tight text-ink" style={{ fontFamily: face.stack }}>
              Abhay 104
            </span>
            <span className="mt-1 block text-2xs text-ink-400">{face.label}</span>
          </button>
        ))}

        {uploaded.map((face) => (
          <div
            key={face.id}
            className={clsx(
              'border px-3 py-2.5 transition-colors',
              value === face.family && !custom
                ? 'border-ink bg-paper-off'
                : 'border-stone-line',
            )}
          >
            <button
              type="button"
              onClick={() => { setCustom(false); onChange(face.family); }}
              title="Uploaded by you"
              className="block w-full text-left"
            >
              <span className="block text-sm leading-tight text-ink" style={{ fontFamily: fontStack(face.family) }}>
                Abhay 104
              </span>
            </button>
            {editing === face.id ? (
              <input
                autoFocus
                defaultValue={face.label}
                aria-label={`Name of ${face.label}`}
                className="field mt-1 w-full px-1 py-0.5 text-2xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== face.label) rename.mutate({ id: face.id, label: next });
                  else setEditing(null);
                }}
              />
            ) : (
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <button
                  type="button"
                  title="Rename"
                  onClick={() => setEditing(face.id)}
                  className="min-w-0 truncate text-2xs text-ink-400 hover:text-ink hover:underline"
                >
                  {face.label} · yours
                </button>
                {removing === face.id ? (
                  <span className="shrink-0 text-2xs">
                    <button
                      type="button"
                      className="text-red-700 underline underline-offset-2"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(face.id)}
                    >
                      delete?
                    </button>
                    {' '}
                    <button type="button" className="text-ink-400 underline underline-offset-2" onClick={() => setRemoving(null)}>
                      keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    title="Remove this font everywhere"
                    className="shrink-0 text-2xs text-ink-300 underline underline-offset-2 hover:text-red-700"
                    onClick={() => setRemoving(face.id)}
                  >
                    remove
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Added here as well as in Settings: the face is wanted while the product is being set up. */}
        <label
          className={clsx(
            'flex cursor-pointer flex-col items-center justify-center border border-dashed border-stone-line',
            'px-3 py-2.5 text-center text-2xs text-ink-400 transition-colors hover:border-ink hover:text-ink',
            upload.isPending && 'pointer-events-none opacity-60',
          )}
        >
          {upload.isPending ? <Spinner size={14} /> : <UploadIcon size={14} />}
          <span className="mt-1 leading-tight">{upload.isPending ? 'Uploading…' : 'Upload a font'}</span>
          <input
            ref={fileRef}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
        </label>
      </div>

      <p className="mt-2 text-2xs leading-relaxed text-ink-400">
        WOFF2, WOFF, TTF or OTF, licensed for use on a website. A font you upload can be used on any
        product and is named from the file; click its name to rename it.
      </p>

      {custom ? (
        <div className="mt-3">
          <input
            value={value}
            placeholder="e.g. &quot;Gotham&quot;, Helvetica, sans-serif"
            className="field w-full"
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="mt-1 text-2xs text-ink-400">
            Any CSS font family or stack. Customers only see it if the font file is uploaded under
            Settings → Live preview → Lettering fonts; until then the nearest built-in face stands in.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="mt-2 text-2xs text-ink-400 underline underline-offset-2 hover:text-ink"
          onClick={() => setCustom(true)}
        >
          Use our own font instead
        </button>
      )}
    </div>
  );
}
