import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import type { PersonalizationField } from '../../lib/types';
import { Spinner } from '../ui';

/**
 * Setting up a piece that carries scannable links, on the product itself.
 *
 * ---- What this exists to prevent ----
 *
 * A connect piece is the one product whose entire content belongs to the
 * buyer: a café's website, its Instagram, its review page. There is nothing
 * to photograph and paint out, because the next buyer's four links are not
 * these four.
 *
 * The studio asked how they would put the NEXT one up by themselves, which is
 * the right question: a piece set up by hand, once, by whoever wrote the code
 * is a piece nobody can reorder. So everything that makes one is here --
 * how many codes, what each is called, whether the buyer sends a logo, what
 * heading is on it, and what shape it is -- and none of it needs a developer.
 *
 * The codes themselves are never collected as pictures. The buyer gives a
 * link and the code is drawn from it; lib/qr.ts says why that is the only
 * honest way round.
 */

const SLOTS = ['qr1', 'qr2', 'qr3', 'qr4'] as const;
type QrSlot = (typeof SLOTS)[number];

/** A first set that fits most businesses, and is renamed in a click. */
const STARTER = ['Website', 'Instagram', 'Facebook', 'Google review'];

interface QrConfig {
  shape?: 'arch' | 'rounded' | 'square';
  back?: boolean;
  base?: boolean;
}

export function ProductQrCodes({
  productId, fields, template, config, onConfigChange,
}: {
  productId: string;
  fields: PersonalizationField[];
  template: string | null;
  config: Record<string, unknown> | null;
  onConfigChange: (next: Record<string, unknown>) => void;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const qr = (config?.qr ?? {}) as QrConfig;
  const shape = qr.shape ?? 'arch';

  const codeFields = SLOTS
    .map((slot) => fields.find((f) => f.previewSlot === slot))
    .filter((f): f is PersonalizationField => Boolean(f));
  const logoField = fields.find((f) => f.previewSlot === 'logo') ?? null;
  const headingField = fields.find((f) => f.previewSlot === 'line1') ?? null;

  const used = new Set(codeFields.map((f) => f.previewSlot));
  const nextFree = SLOTS.find((slot) => !used.has(slot));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
  const fail = (error: unknown) =>
    push(error instanceof ApiError ? error.message : 'That did not work — try again.', 'error');

  const run = async (what: string, job: () => Promise<unknown>) => {
    setBusy(what);
    try {
      await job();
      await refresh();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const addCode = (slot: QrSlot, label: string) =>
    api.post(`/admin/products/${productId}/personalization`, {
      key: slot,
      label,
      type: 'URL',
      previewSlot: slot,
      required: false,
      status: 'PUBLISHED',
      placeholder: 'example.com/yourpage',
      helpText: 'Paste the link. The QR code is drawn for you.',
      options: [],
    });

  const setQr = (patch: QrConfig) =>
    onConfigChange({ ...(config ?? {}), qr: { ...qr, ...patch } });

  const wrongTemplate = template !== 'qr-board';

  return (
    <div className="mt-5 border-t border-stone-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-2xs uppercase tracking-architect text-ink-500">Scannable links</h4>
        {codeFields.length ? (
          <span className="text-2xs text-ink-400">
            {codeFields.length} of 4 code{codeFields.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-2xs leading-relaxed text-ink-400">
        For a piece that carries QR codes. The customer gives a link and the code is drawn from it —
        nothing is uploaded, and every code scans.
      </p>

      {wrongTemplate && codeFields.length ? (
        <p className="mt-3 border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-2xs text-ink-600">
          These codes are set up, but the live preview is set to
          {' '}
          <b>{template ?? 'nothing'}</b>
          , which cannot draw them. Choose <b>QR board</b> above to show them on the piece.
        </p>
      ) : null}

      {/* ---- the codes ---- */}
      {codeFields.length ? (
        <ul className="mt-3 space-y-2">
          {codeFields.map((field) => (
            <li key={field.id} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-2xs uppercase tracking-architect text-ink-300">
                {field.previewSlot?.toUpperCase()}
              </span>
              <input
                className="field flex-1 py-1 text-xs"
                defaultValue={field.label}
                aria-label={`What to call ${field.previewSlot}`}
                placeholder="Website, Menu, Google review…"
                onBlur={(e) => {
                  const label = e.target.value.trim();
                  if (!label || label === field.label) return;
                  void run(field.id, () =>
                    api.patch(`/admin/products/${productId}/personalization/${field.id}`, { label }));
                }}
              />
              <button
                type="button"
                className="text-2xs uppercase tracking-architect text-ink-400 underline underline-offset-2 hover:text-state-danger"
                onClick={() => void run(field.id, () =>
                  api.delete(`/admin/products/${productId}/personalization/${field.id}`))}
              >
                {busy === field.id ? <Spinner size={12} /> : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {nextFree ? (
          <button
            type="button"
            className="border border-stone-line px-3 py-1.5 text-2xs uppercase tracking-architect transition-colors hover:border-ink"
            onClick={() => void run('add', () =>
              addCode(nextFree, STARTER[codeFields.length] ?? 'Link'))}
          >
            {busy === 'add' ? <Spinner size={12} /> : `Add a code (${codeFields.length}/4)`}
          </button>
        ) : (
          <span className="text-2xs text-ink-400">All four codes are set up.</span>
        )}

        {/*
          * Four at once, because a connect piece almost always wants the same
          * four and naming them one at a time is the same work four times.
          */}
        {!codeFields.length ? (
          <button
            type="button"
            className="border border-ink bg-ink px-3 py-1.5 text-2xs uppercase tracking-architect text-paper transition-opacity hover:opacity-85"
            onClick={() => void run('starter', async () => {
              for (let i = 0; i < SLOTS.length; i += 1) await addCode(SLOTS[i], STARTER[i]);
            })}
          >
            {busy === 'starter' ? <Spinner size={12} /> : 'Set up all four'}
          </button>
        ) : null}
      </div>

      {/* ---- what else the buyer sends ---- */}
      <div className="mt-4 space-y-2">
        <Toggle
          on={Boolean(logoField)}
          busy={busy === 'logo'}
          label="Customer uploads their own logo"
          hint="Shown at the top of the piece. PNG or SVG with a clear background works best."
          onChange={() => void run('logo', () => (logoField
            ? api.delete(`/admin/products/${productId}/personalization/${logoField.id}`)
            : api.post(`/admin/products/${productId}/personalization`, {
              key: 'brandLogo',
              label: 'Your logo',
              type: 'IMAGE_UPLOAD',
              previewSlot: 'logo',
              required: false,
              status: 'PUBLISHED',
              helpText: 'PNG or SVG with a clear background works best.',
              options: [],
            })))}
        />
        <Toggle
          on={Boolean(headingField)}
          busy={busy === 'heading'}
          label="Customer can change the heading"
          hint="The words across the piece. Left off, the heading stays as the design has it."
          onChange={() => void run('heading', () => (headingField
            ? api.delete(`/admin/products/${productId}/personalization/${headingField.id}`)
            : api.post(`/admin/products/${productId}/personalization`, {
              key: 'heading',
              label: 'Heading',
              type: 'TEXT',
              previewSlot: 'line1',
              required: false,
              status: 'PUBLISHED',
              maxLength: 22,
              placeholder: "LET'S CONNECT",
              helpText: 'Short — it runs across the top of the piece.',
              options: [],
            })))}
        />
      </div>

      {/* ---- the shape of the piece ---- */}
      <div className="mt-4">
        <span className="text-2xs uppercase tracking-architect text-ink-500">Shape</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            { value: 'arch', label: 'Arch' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'square', label: 'Square' },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={shape === option.value}
              className={clsx(
                'border px-3 py-1.5 text-2xs uppercase tracking-architect transition-colors',
                shape === option.value ? 'border-ink bg-ink text-paper' : 'border-stone-line hover:border-ink',
              )}
              onClick={() => setQr({ shape: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4">
          <Tick
            on={qr.back ?? shape === 'arch'}
            label="Panel behind, with the heading round it"
            onChange={(on) => setQr({ back: on })}
          />
          <Tick
            on={qr.base ?? shape === 'arch'}
            label="Stands on a foot"
            onChange={(on) => setQr({ base: on })}
          />
        </div>
      </div>
    </div>
  );
}

function Toggle({
  on, label, hint, busy, onChange,
}: {
  on: boolean;
  label: string;
  hint: string;
  busy: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" className="mt-0.5" checked={on} onChange={onChange} disabled={busy} />
      <span className="text-xs leading-snug">
        {label}
        {busy ? <Spinner size={11} className="ml-2 inline" /> : null}
        <span className="block text-2xs text-ink-400">{hint}</span>
      </span>
    </label>
  );
}

function Tick({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-2xs text-ink-600">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
