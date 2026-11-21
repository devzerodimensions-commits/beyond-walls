/**
 * Which question each line of a plate answers.
 *
 * Reading a photograph finds where the lines of writing sit. It cannot find
 * what they MEAN -- nothing in a picture says the short line at the top is a
 * flat number rather than a surname. That meaning comes from the product: the
 * questions it asks, in the order it asks them.
 *
 * The binding used to be decided once, when the photograph was read, and
 * written into the product. That was the bug behind a whole family of
 * complaints. A product read before a question was renamed, reordered or
 * added kept pointing at slots that no longer existed: one plate had three
 * lines bound to line1, line2 and line3 while the product asked for line1,
 * line2 and a house number, so a customer typed their flat number and watched
 * it go nowhere. Nothing re-derived it, so it stayed wrong forever.
 *
 * So it is no longer stored as the truth. It is worked out from the product
 * every time the product is served, which means a product cannot drift out of
 * step with its own preview however its questions are edited afterwards.
 */

/**
 * Slots a line of writing can be bound to, in the order lines are given out
 * to a plate nobody has asked any questions about yet.
 *
 * Name first. Across the studio's plates the name is the top line on four of
 * six; the flat number is on top on two. This list used to start with the
 * number, so a fresh plate's top line -- usually the big script name -- was
 * labelled "House / flat number" and made the one required question, and a
 * customer would have been told to type their flat number into the name.
 * A plain "First line" is never wrong in that way; which line is the number
 * is for the studio to say, and the editor asks it to.
 */
const TEXT_SLOTS = ['line1', 'line2', 'line3', 'number'] as const;

/*
 * `logo` is drawable but never bound automatically: it holds a picture the
 * customer picks, not a line of writing that was found on the plate, so a
 * detected line must never land in it. The studio places that box by hand.
 *
 * fontFamily, plateColor and textColor are settings rather than lines. They
 * were the sharper half of the same bug: the old rule took every question
 * that named a slot, so a product whose font question happened to be asked
 * first would have bound its first line of writing to "fontFamily" and
 * painted the customer's name nowhere at all.
 */
const DRAWABLE = new Set<string>(TEXT_SLOTS);

export interface PreviewField {
  previewSlot: string | null;
  sortOrder: number;
}

interface LetteringField {
  previewSlot: string | null;
  defaultValue: string | null;
  options: unknown;
}

/**
 * Starts the customer's lettering choice on the face the studio set.
 *
 * Two places hold a typeface now: the preview's own default, which the studio
 * picks in the editor, and the lettering question a customer answers. They
 * have to agree, or a product whose face was changed after the question was
 * made would open on the old one -- the customer's untouched answer quietly
 * overriding the studio's choice.
 *
 * So the question is started on the product's current face every time the
 * product is served, exactly as the lines are bound. Nothing is stored.
 *
 * A face the question does not offer -- one the studio named itself, such as
 * "Yustine Signature" on the cut-out -- is put in front of the other choices
 * and the question starts on it. Left out, the question's own default won
 * over the studio's face and the signature name previewed in block capitals;
 * and a customer could never get back to the design's face once they had
 * tried another. Checkout validates against the questions as served here, so
 * the added choice is accepted there too.
 */
export function alignLettering<T extends LetteringField>(
  fields: T[],
  config: unknown,
): T[] {
  const face = (config as { defaults?: { fontFamily?: string } } | null)?.defaults?.fontFamily;
  if (!face) return fields;

  return fields.map((field) => {
    if (field.previewSlot !== 'fontFamily') return field;
    if (field.defaultValue === face) return field;
    const options = Array.isArray(field.options) ? field.options as { value?: unknown }[] : [];
    if (!options.some((o) => o?.value === face)) {
      const label = face.split(',')[0].replace(/["']/g, '').trim() || 'As designed';
      return { ...field, options: [{ label, value: face }, ...options], defaultValue: face };
    }
    return { ...field, defaultValue: face };
  });
}

interface PhotoBox {
  slot: string;
  y: number;
  [key: string]: unknown;
}

/** The slots this product actually asks a customer to fill, top question first. */
export function askedSlots(fields: PreviewField[]): string[] {
  const seen = new Set<string>();
  return [...fields]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => f.previewSlot)
    .filter((slot): slot is string => !!slot && DRAWABLE.has(slot))
    .filter((slot) => (seen.has(slot) ? false : (seen.add(slot), true)));
}

/**
 * Lines of a plate, in the order they are asked for.
 *
 * Used both when a photograph is first read and every time a product is
 * served, so there is one rule rather than two that can disagree.
 */
export function slotOrder(fields: PreviewField[]): string[] {
  const asked = askedSlots(fields);
  return [...asked, ...TEXT_SLOTS.filter((s) => !asked.includes(s))];
}

/**
 * Repairs a stored preview so its lines point at questions the product asks.
 *
 * A sound assignment is left alone, because the studio can set it by hand in
 * the editor and that choice has to survive: a plate whose biggest line is the
 * surname rather than the first name is a real thing, and only a person can
 * say so. Sound means every line points at a question this product asks and no
 * two lines point at the same one.
 *
 * Anything else is re-derived from the top of the plate down. Returns the same
 * object when there is nothing to repair, so this costs nothing on the
 * overwhelming majority of requests.
 */
export function bindPreviewBoxes<T>(config: T, fields: PreviewField[]): T {
  const stored = config as { photo?: { boxes?: unknown } } | null | undefined;
  const boxes = stored?.photo?.boxes;
  if (!Array.isArray(boxes) || !boxes.length) return config;

  const asked = askedSlots(fields);
  if (!asked.length) return config;

  /*
   * A symbol's box is a picture, never a line of writing, so it is left out
   * of the binding entirely. Counted in, it made every plate with a symbol
   * look unsound, and the repair then handed the symbol's box to a line --
   * the customer's surname drawn where the Ganesha should be.
   */
  const symbolBoxes = (boxes as PhotoBox[]).filter((b) => b?.slot === 'logo');
  const lineBoxes = (boxes as PhotoBox[]).filter((b) => b?.slot !== 'logo');

  const slots = lineBoxes.map((b) => b?.slot);
  const sound =
    slots.every((s) => typeof s === 'string' && asked.includes(s))
    && new Set(slots).size === slots.length;
  if (sound) return config;

  const order = slotOrder(fields);
  const placed = [...lineBoxes]
    .sort((a, b) => (a?.y ?? 0) - (b?.y ?? 0))
    .map((box, index) => ({ ...box, slot: order[index] ?? order[order.length - 1] }));

  return {
    ...(stored as object),
    photo: { ...(stored as { photo: object }).photo, boxes: [...placed, ...symbolBoxes] },
  } as T;
}

/**
 * What the studio needs to know about a plate whose lines and questions do not
 * line up. Returns null when they do.
 */
export function bindingWarning(
  config: unknown,
  fields: PreviewField[],
): { lines: number; asked: number; missing: string[] } | null {
  const all = (config as { photo?: { boxes?: unknown } } | null)?.photo?.boxes;
  if (!Array.isArray(all)) return null;
  const boxes = (all as PhotoBox[]).filter((b) => b?.slot !== 'logo');

  const asked = askedSlots(fields);
  if (boxes.length >= asked.length) return null;

  return {
    lines: boxes.length,
    asked: asked.length,
    missing: asked.slice(boxes.length),
  };
}
