import { useState } from 'react';
import { useSettings, useToast } from '../../context/StoreProvider';
import { PLATE_FONT_STYLESHEET } from './LivePreview';
import { previewToPng } from '../../lib/previewImage';

/**
 * Letting the customer keep the preview.
 *
 * A nameplate is decided on by two or three people who are rarely at the same
 * screen, and the preview is the only thing anybody can look at before it is
 * cut. Without this, showing it to a husband or a mother meant screenshotting
 * a browser window, so what reached them was a crop of a shop with the plate
 * somewhere in the middle of it -- and nothing on it saying where it came
 * from. The picture travels further than the site does; it should carry the
 * shop's name with it.
 *
 * Shared through the phone's own sheet where there is one, which is how
 * anything gets to WhatsApp on a phone, and downloaded everywhere else.
 */
export function SavePreview({
  target, name,
}: {
  /** The element holding the preview; its <svg> is what gets drawn. */
  target: React.RefObject<HTMLDivElement | null>;
  /** The product, used to name the file. */
  name: string;
}) {
  const { get } = useSettings();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  /*
   * The shop's name is on every picture that leaves here, without exception.
   *
   * The settings getter falls back only when a value is missing, not when it
   * is blank -- so a brand name cleared in Settings, by accident or while
   * editing, would have taken the shop's name off every preview a customer
   * sends to their family. That is the one thing the picture exists to carry,
   * and it is not something to leave to a field being filled in.
   */
  const shop = get<string>('brand.name', '').trim() || 'Beyond Walls';

  const save = async () => {
    const svg = target.current?.querySelector('[data-plate] > svg');
    if (!svg) {
      push('There is nothing to save yet', 'error');
      return;
    }

    setBusy(true);
    try {
      const mark = `${shop} · ${window.location.host}`;
      const blob = await previewToPng(svg as SVGSVGElement, PLATE_FONT_STYLESHEET, mark);
      const file = new File([blob], `${slug(name)}-preview.png`, { type: 'image/png' });

      /*
       * The phone's own share sheet first. On a phone this is the only route
       * to WhatsApp, which is where these actually go; a download lands in a
       * folder the customer then has to go and find.
       */
      const sharer = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      if (sharer.canShare?.({ files: [file] }) && sharer.share) {
        try {
          await sharer.share({ files: [file], title: name });
          return;
        } catch (err) {
          // Dismissing the sheet is a decision, not a failure.
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }

      /*
       * In the page, and released later.
       *
       * A link that is never added to the document does nothing at all in
       * some browsers, and releasing the url in the next statement pulls the
       * file out from under a download that has only just been asked for.
       * Both work in Chrome and neither is safe to rely on, so the link goes
       * in properly and the url is let go once the save has certainly begun.
       */
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      push('Preview saved to your downloads', 'success');
    } catch {
      push('That preview could not be saved', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      className="mt-3 w-full border border-stone-line px-4 py-2.5 text-2xs uppercase tracking-architect text-ink-600 transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
    >
      {busy ? 'Preparing…' : 'Save or share this preview'}
    </button>
  );
}

/** A filename nobody has to rename before sending it on. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nameplate';
}
