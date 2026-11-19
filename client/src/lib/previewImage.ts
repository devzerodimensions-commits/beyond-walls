/**
 * Turning the live preview into a picture the customer can keep.
 *
 * A nameplate is bought by two or three people who are not in the same room,
 * and the preview is the only thing anyone can actually look at before it is
 * cut. Until now it existed solely on the product page: to show it to a
 * husband or a mother, a customer had to screenshot a browser window, so what
 * arrived was a crop of a shop with the plate somewhere inside it.
 *
 * ---- Why this is harder than drawing the canvas ----
 *
 * The preview is an SVG, and an SVG rasterised through an <img> is rendered in
 * a sandbox: no page stylesheet reaches it, no webfont loads, and every
 * external reference is refused. Left alone it produces the right plate, the
 * right colours and the wrong lettering -- a script nameplate saved in Times.
 * For a piece whose whole character is its face, that is not a smaller version
 * of the feature; it is a picture of a different product.
 *
 * So everything the drawing needs is carried into it first: the artwork as
 * bytes, and the faces actually used as bytes, which is the only form a
 * sandboxed render will accept.
 */

/** Fetches a URL and returns it as a data: URI the sandbox will accept. */
async function inline(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read ${url}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The quoted family names out of a CSS font stack. */
function familiesIn(stack: string): string[] {
  return Array.from(stack.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

/**
 * The @font-face rules for the faces this drawing actually uses, with the
 * font files themselves carried inline.
 *
 * Only the families in use: the shop's stylesheet covers every face on offer,
 * and fetching all of them to save one plate would be most of a megabyte for
 * nothing.
 */
async function embeddedFonts(stylesheet: string, wanted: Set<string>): Promise<string> {
  let css: string;
  try {
    const response = await fetch(stylesheet);
    if (!response.ok) return '';
    css = await response.text();
  } catch {
    return '';
  }

  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  const keep = blocks.filter((block) => {
    const family = /font-family:\s*'([^']+)'|font-family:\s*"([^"]+)"/.exec(block);
    const name = family?.[1] ?? family?.[2];
    return name ? wanted.has(name) : false;
  });

  const resolved = await Promise.all(keep.map(async (block) => {
    const src = /url\((https:\/\/[^)]+)\)/.exec(block);
    if (!src) return '';
    try {
      return block.replace(src[1], await inline(src[1]));
    } catch {
      return '';
    }
  }));

  return resolved.filter(Boolean).join('\n');
}

/**
 * Renders a live preview to a PNG.
 *
 * @param svg        the preview as it is on the page; it is never modified
 * @param stylesheet where the plate faces come from
 * @param mark       the shop's own name and address, set along the bottom
 */
export async function previewToPng(
  svg: SVGSVGElement,
  stylesheet: string,
  mark: string,
): Promise<Blob> {
  const box = svg.viewBox.baseVal;
  const width = box?.width || svg.clientWidth || 800;
  const height = box?.height || svg.clientHeight || 400;

  const clone = svg.cloneNode(true) as SVGSVGElement;

  // Artwork as bytes: a sandboxed render refuses to go and fetch it.
  const images = Array.from(clone.querySelectorAll('image'));
  await Promise.all(images.map(async (node) => {
    const href = node.getAttribute('href') ?? node.getAttribute('xlink:href');
    if (!href || href.startsWith('data:')) return;
    try {
      node.setAttribute('href', await inline(href));
    } catch {
      /* Leave it; a missing photograph is better than no picture at all. */
    }
  }));

  const wanted = new Set<string>();
  for (const node of Array.from(clone.querySelectorAll('text'))) {
    const stack = node.getAttribute('font-family');
    if (stack) familiesIn(stack).forEach((name) => wanted.add(name));
  }

  const fonts = await embeddedFonts(stylesheet, wanted);

  /*
   * A band along the bottom carrying the shop's name.
   *
   * It is the point of saving the picture at all: the preview travels further
   * than the website does, and a plate sent to a family group with nothing on
   * it saying where it came from takes the shop's best argument with it and
   * drops the shop's name on the way.
   */
  const band = Math.max(22, Math.round(height * 0.075));
  const total = height + band;

  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('x', '0');
  clone.setAttribute('y', '0');

  const outer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  outer.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  outer.setAttribute('width', String(width));
  outer.setAttribute('height', String(total));
  outer.setAttribute('viewBox', `0 0 ${width} ${total}`);

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = fonts;
  outer.appendChild(style);

  const paper = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  paper.setAttribute('width', String(width));
  paper.setAttribute('height', String(total));
  paper.setAttribute('fill', '#FFFFFF');
  outer.appendChild(paper);
  outer.appendChild(clone);

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', String(width / 2));
  label.setAttribute('y', String(height + band * 0.68));
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('fill', '#6B6761');
  label.setAttribute('font-family', 'Archivo, Helvetica, Arial, sans-serif');
  label.setAttribute('font-size', String(Math.round(band * 0.46)));
  label.setAttribute('letter-spacing', '1');
  label.textContent = mark;
  outer.appendChild(label);

  const markup = new XMLSerializer().serializeToString(outer);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    // Twice over, so the picture stands up on a phone screen and in print.
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(total * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot save pictures.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be saved.'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
