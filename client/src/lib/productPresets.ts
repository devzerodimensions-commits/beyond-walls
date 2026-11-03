import type { PersonalizationField } from './types';

/**
 * Ready-made personalisation field sets for the common Beyond Walls products.
 *
 * Each field already carries the preview slot it drives, which is the part
 * that is tedious and easy to get wrong by hand: a field wired to the wrong
 * slot draws the house number where the name should be and nothing complains.
 *
 * Shared by the full product editor and by the add-product wizard, so the two
 * cannot offer different versions of the same preset.
 */
/** Ready-made field sets for the common Beyond Walls products. */
export const PRESETS: { label: string; fields: Partial<PersonalizationField>[] }[] = [
  {
    label: 'Home nameplate',
    fields: [
      { key: 'houseNumber', label: 'House / flat number', type: 'TEXT', maxLength: 10, previewSlot: 'number' },
      { key: 'name', label: 'Name', type: 'TEXT', required: true, maxLength: 28, previewSlot: 'line1' },
      { key: 'familyName', label: 'Family name', type: 'TEXT', maxLength: 20, previewSlot: 'line2' },
      { key: 'instructions', label: 'Instructions for us', type: 'TEXTAREA', maxLength: 500 },
    ],
  },
  {
    label: 'Office / desk plate',
    fields: [
      { key: 'officeName', label: 'Office or company name', type: 'TEXT', required: true, maxLength: 40, previewSlot: 'line1' },
      { key: 'personName', label: 'Name', type: 'TEXT', maxLength: 30, previewSlot: 'line2' },
      { key: 'degree', label: 'Degree / qualification', type: 'TEXT', maxLength: 40, previewSlot: 'line3' },
      { key: 'logoUpload', label: 'Logo', type: 'IMAGE_UPLOAD', previewSlot: 'logo' },
      { key: 'instructions', label: 'Instructions for us', type: 'TEXTAREA', maxLength: 500 },
    ],
  },
  {
    label: 'GST plate',
    fields: [
      { key: 'officeName', label: 'Business name', type: 'TEXT', required: true, maxLength: 60, previewSlot: 'line1' },
      { key: 'gstin', label: 'GSTIN', type: 'GSTIN', required: true, previewSlot: 'line2' },
      { key: 'instructions', label: 'Instructions for us', type: 'TEXTAREA', maxLength: 500 },
    ],
  },
  {
    label: 'QR stand',
    fields: [
      { key: 'qrUrl', label: 'Link the QR should open', type: 'URL', required: true },
      { key: 'message', label: 'Text on the stand', type: 'TEXT', maxLength: 40, previewSlot: 'line1' },
      { key: 'logoUpload', label: 'Logo', type: 'IMAGE_UPLOAD', previewSlot: 'logo' },
    ],
  },
];

/**
 * The field set that goes with a preview template.
 *
 * Used when a template has been worked out from a photograph: having decided
 * the plate is a wide nameplate, the fields it needs follow from that, and
 * asking the studio to pick them again is asking the same question twice.
 */
export const PRESET_FOR_TEMPLATE: Record<string, string> = {
  'nameplate-minimal': 'Home nameplate',
  'nameplate-classic': 'Home nameplate',
  'desk-plate': 'Office / desk plate',
  'sign-square': 'Home nameplate',
  /*
   * The three decorated designs ask for the same three things as a plain
   * nameplate -- a number and two lines of name -- so they take the same
   * preset. Without an entry here the wizard offers no fields at all and the
   * studio has to build them by hand, which is the step the wizard exists to
   * remove. The wording on each field is still theirs to change per product.
   */
  'plate-botanical': 'Home nameplate',
  'plate-vine': 'Home nameplate',
  'plate-cubes': 'Home nameplate',
};

export function presetByLabel(label: string | null | undefined) {
  return PRESETS.find((p) => p.label === label) ?? null;
}
