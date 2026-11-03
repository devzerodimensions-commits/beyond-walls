/**
 * The decorative panels that make three of the plate designs what they are.
 *
 * These are drawings, not layout: each one fills a rectangle it is handed and
 * knows nothing about lettering. LivePreview places them and puts the text
 * beside or inside them. Keeping the path data here is what stops the template
 * file becoming unreadable.
 *
 * ---- Why they are drawn rather than traced ----
 *
 * The studio supplied flat artwork for each design. Tracing it would have
 * frozen the colours into the picture, and the whole point of the live preview
 * is that the customer's own plate and text colours drive it -- a botanical
 * frame traced from a grey photograph stays grey on a brass plate. So the
 * ornament is built from a motif and a rule for repeating it, and takes its
 * colours from the same two values as the rest of the plate.
 *
 * The vine is the exception and keeps its own palette, because the olive, the
 * terracotta and the cream ARE that design; recolouring them to a customer's
 * plate colour would leave a different product on screen.
 */

/**
 * Deterministic pseudo-random in [0, 1).
 *
 * The botanical frame needs a few hundred leaves that do not look like a grid,
 * but the same plate must come out identically on every render and every
 * machine -- a preview that reshuffles its leaves when React re-renders, or
 * draws something different from the one the studio approved, is not a preview.
 * So: hashed from the leaf's own index, never Math.random().
 */
function rand(index: number, salt: number): number {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A pointed leaf of `len`, growing upward from the origin. */
function leafPath(len: number, fatness = 0.3): string {
  const w = len * fatness;
  return [
    `M0 0`,
    `C${w} ${-len * 0.26}, ${w * 0.84} ${-len * 0.74}, 0 ${-len}`,
    `C${-w * 0.84} ${-len * 0.74}, ${-w} ${-len * 0.26}, 0 0`,
    'Z',
  ].join(' ');
}

interface LeafFrameProps {
  width: number;
  height: number;
  /** Thickness of the decorated border. */
  band: number;
  /** The cut-out: leaves are this colour, usually the lettering colour. */
  color: string;
  /** Shows between the leaves and separates one from the next. */
  ground: string;
  uid: string;
}

/**
 * A dense botanical border, cut flush at an inner rectangle.
 *
 * Built as fans of leaves on a staggered grid, each fan turned by its own
 * hashed angle so the field reads as overgrown rather than tiled, then masked
 * so the middle of the plate comes back empty for the lettering. The leaves
 * overlap on purpose: the grid step is smaller than a leaf, which is what makes
 * it look cut from one sheet instead of assembled from stamps.
 */
export function LeafFrame({ width, height, band, color, ground, uid }: LeafFrameProps) {
  const STEP = 68;
  const cols = Math.ceil(width / STEP) + 1;
  const rows = Math.ceil(height / STEP) + 1;

  const fans: JSX.Element[] = [];
  const berries: JSX.Element[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col;
      // Odd rows sit half a step over, so no leaf lines up with the one above.
      const cx = col * STEP + (row % 2 ? STEP / 2 : 0) + rand(i, 1) * 14 - 7;
      const cy = row * STEP + rand(i, 2) * 14 - 7;

      // Skip the middle of the plate entirely rather than draw it and mask it.
      const inset = band + 40;
      if (cx > inset && cx < width - inset && cy > inset && cy < height - inset) continue;

      const count = 6 + Math.floor(rand(i, 3) * 5);
      const base = rand(i, 4) * 360;
      const spread = 150 + rand(i, 5) * 150;
      const reach = 54 + rand(i, 6) * 44;

      const leaves: JSX.Element[] = [];
      for (let k = 0; k < count; k += 1) {
        const angle = base + spread * (k / (count - 1) - 0.5);
        const len = reach * (0.66 + rand(i * 11 + k, 7) * 0.46);
        leaves.push(
          <path
            key={k}
            d={leafPath(len, 0.21 + rand(i * 11 + k, 8) * 0.1)}
            transform={`rotate(${angle.toFixed(1)})`}
          />,
        );
      }

      fans.push(
        <g key={i} transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}>
          {leaves}
        </g>,
      );

      // A berry on roughly one hub in three, which is what breaks up the
      // leaf texture in the studio's artwork.
      if (rand(i, 9) > 0.62) {
        berries.push(
          <circle
            key={i}
            cx={(cx + (rand(i, 10) - 0.5) * 30).toFixed(1)}
            cy={(cy + (rand(i, 11) - 0.5) * 30).toFixed(1)}
            r={(5 + rand(i, 12) * 4).toFixed(1)}
          />,
        );
      }
    }
  }

  const innerX = band;
  const innerY = band;
  const innerW = width - band * 2;
  const innerH = height - band * 2;

  return (
    <>
      <defs>
        {/*
          A mask, not a clip path with evenodd: two rects in a mask is the one
          spelling of "everything except the middle" that every browser agrees
          on, and the inner edge has to be crisp because the lettering sits
          right against it.
        */}
        <mask id={`frame-${uid}`}>
          <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
          <rect x={innerX} y={innerY} width={innerW} height={innerH} fill="#000000" />
        </mask>
      </defs>
      <g mask={`url(#frame-${uid})`} fill={color} stroke={ground} strokeWidth="2.2" strokeLinejoin="round">
        {fans}
        {berries}
      </g>
    </>
  );
}

// ---------------------------------------------------------------------------
// The vine band
// ---------------------------------------------------------------------------

/**
 * Fixed, because these colours are the design.
 *
 * Everywhere else in the preview a colour is a customer's choice. Here it is
 * not: the studio's piece is a cream plate with an olive vine and terracotta
 * flowers, and a customer who picks a black plate is not ordering this.
 */
export const VINE_PALETTE = {
  ground: '#F7F3EA',
  frame: '#8C3B24',
  ribbon: '#7E2B1C',
  stem: '#6E7A3F',
  leaf: '#6E7A3F',
  bloom: '#C33A2B',
  bloomInner: '#E8732A',
  petal: '#E8863A',
  heart: '#F2C14E',
  outline: '#A33A1C',
};

/** One stylised tulip, standing on the origin. */
function Tulip({ scale = 1, turn = 0 }: { scale?: number; turn?: number }) {
  return (
    <g transform={`rotate(${turn}) scale(${scale})`}>
      {/* Outer side petals, opening away from the cup. */}
      <path
        d="M-13 -3 C-27 -14, -27 -33, -15 -42 C-7 -31, -10 -15, -3 -4 Z"
        fill={VINE_PALETTE.bloom}
        stroke={VINE_PALETTE.outline}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M13 -3 C27 -14, 27 -33, 15 -42 C7 -31, 10 -15, 3 -4 Z"
        fill={VINE_PALETTE.bloom}
        stroke={VINE_PALETTE.outline}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* The cup. */}
      <path
        d="M-15 0 C-16 -20, -9 -34, 0 -38 C9 -34, 16 -20, 15 0 Z"
        fill={VINE_PALETTE.bloomInner}
        stroke={VINE_PALETTE.outline}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M-7 -2 C-8 -18, -4 -28, 0 -31 C4 -28, 8 -18, 7 -2 Z"
        fill={VINE_PALETTE.heart}
      />
    </g>
  );
}

/** A small six-petal flower, centred on the origin. */
function Floret({ scale = 1 }: { scale?: number }) {
  const petals = [0, 60, 120, 180, 240, 300].map((angle) => (
    <ellipse
      key={angle}
      cx="0"
      cy="-11"
      rx="6"
      ry="11"
      transform={`rotate(${angle})`}
      fill={VINE_PALETTE.petal}
      stroke={VINE_PALETTE.outline}
      strokeWidth="1.3"
    />
  ));
  return (
    <g transform={`scale(${scale})`}>
      {petals}
      <circle r="5.5" fill={VINE_PALETTE.heart} stroke={VINE_PALETTE.outline} strokeWidth="1.2" />
    </g>
  );
}

interface VineBandProps {
  x: number;
  y: number;
  width: number;
  height: number;
  uid: string;
}

/**
 * The floral band: a patterned ribbon down each side and a flowering vine
 * between them.
 *
 * The vine is one serpentine path rather than a stack of copies, so it reads as
 * a single growing stem however tall the band is. Blooms sit at its outer
 * bends, where the curve has already made room for them.
 */
export function VineBand({ x, y, width, height, uid }: VineBandProps) {
  const RIBBON = Math.min(28, width * 0.1);
  const fieldX = x + RIBBON;
  const fieldW = width - RIBBON * 2;
  const cx = fieldX + fieldW / 2;
  const amp = Math.min(fieldW * 0.34, 76);

  /** One bend of the stem per half period; the period sets the flower spacing. */
  const PERIOD = 120;
  const bends = Math.max(2, Math.round(height / PERIOD));
  const step = height / bends;

  /*
   * The stem overshoots the band at both ends and is clipped.
   *
   * Ending it exactly on the edge put a bloom half outside the band and left
   * the stem stopping dead against the frame, which reads as a cut-off drawing
   * rather than a length of vine. Running it past both edges and clipping gives
   * the growing plant the band is meant to show; blooms are then only placed
   * where a whole one fits.
   */
  const BLOOM_ROOM = 48;
  const FIRST = -1;
  // Each segment leaves one side and arrives at the other, so the path has to
  // start on the side the first segment leaves from.
  const firstSide = FIRST % 2 ? -1 : 1;
  let stem = `M${(cx + firstSide * amp).toFixed(1)} ${(y + FIRST * step).toFixed(1)}`;
  const blooms: JSX.Element[] = [];
  const sprigs: JSX.Element[] = [];

  for (let k = FIRST; k <= bends; k += 1) {
    const side = k % 2 ? -1 : 1;
    const top = y + k * step;
    const bottom = top + step;
    const bloomFits = top > y + BLOOM_ROOM && top < y + height - BLOOM_ROOM;
    stem +=
      ` C${(cx + side * amp * 1.7).toFixed(1)} ${(top + step * 0.4).toFixed(1)},` +
      ` ${(cx - side * amp * 1.7).toFixed(1)} ${(top + step * 0.6).toFixed(1)},` +
      ` ${(cx - side * amp).toFixed(1)} ${bottom.toFixed(1)}`;

    // A bloom on the outside of each bend, leaning the way the stem does.
    if (bloomFits) {
      blooms.push(
        <g key={`b${k}`} transform={`translate(${(cx + side * amp).toFixed(1)} ${top.toFixed(1)})`}>
          <Tulip scale={1.22} turn={side * 16} />
        </g>,
      );
    }

    /*
     * Foliage on the straight of the curve, where the stem is steepest.
     *
     * Four leaves and two florets per bend, not one of each: the studio's band
     * is a filled panel, and a single leaf either side left so much cream
     * showing that it read as a stem drawn on an empty plate rather than as
     * the cut floral border it is.
     */
    const midY = top + step * 0.5;
    const leaves: [number, number][] = [
      [-128, 52],
      [-96, 40],
      [-58, 46],
      [-24, 34],
    ];
    sprigs.push(
      <g key={`s${k}`} transform={`translate(${cx.toFixed(1)} ${midY.toFixed(1)})`}>
        {leaves.map(([angle, len]) => (
          <path
            key={angle}
            d={leafPath(len, 0.32)}
            transform={`rotate(${side * angle})`}
            fill={VINE_PALETTE.leaf}
            stroke={VINE_PALETTE.outline}
            strokeWidth="1.2"
          />
        ))}
        <g transform={`translate(${(side * -amp * 0.8).toFixed(1)} ${(step * 0.2).toFixed(1)})`}>
          <Floret scale={0.95} />
        </g>
        <g transform={`translate(${(side * amp * 0.5).toFixed(1)} ${(-step * 0.24).toFixed(1)})`}>
          <Floret scale={0.7} />
        </g>
      </g>,
    );
  }

  return (
    <>
      <defs>
        {/* The rosettes running up the two ribbons. */}
        <pattern
          id={`ribbon-${uid}`}
          patternUnits="userSpaceOnUse"
          x={0}
          y={y}
          width={RIBBON}
          height="34"
        >
          <rect width={RIBBON} height="34" fill={VINE_PALETTE.ribbon} />
          <g transform={`translate(${RIBBON / 2} 17)`}>
            <Floret scale={0.42} />
          </g>
        </pattern>
        <clipPath id={`vine-${uid}`}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
      </defs>

      <g clipPath={`url(#vine-${uid})`}>
        <rect x={fieldX} y={y} width={fieldW} height={height} fill={VINE_PALETTE.ground} />
        <rect x={x} y={y} width={RIBBON} height={height} fill={`url(#ribbon-${uid})`} />
        <rect
          x={x + width - RIBBON}
          y={y}
          width={RIBBON}
          height={height}
          fill={`url(#ribbon-${uid})`}
        />
        <path
          d={stem}
          fill="none"
          stroke={VINE_PALETTE.stem}
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        {sprigs}
        {blooms}
      </g>

      {/* Hairlines where the ribbons meet the field, as on the studio's piece. */}
      <g stroke={VINE_PALETTE.frame} strokeWidth="1.4" fill="none">
        <line x1={fieldX} y1={y} x2={fieldX} y2={y + height} />
        <line x1={fieldX + fieldW} y1={y} x2={fieldX + fieldW} y2={y + height} />
      </g>
    </>
  );
}

// ---------------------------------------------------------------------------
// The cube band
// ---------------------------------------------------------------------------

interface CubeBandProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The cut-out colour. */
  color: string;
  /** Shows through the gaps and draws the three faces apart. */
  ground: string;
  uid: string;
}

/**
 * A field of isometric cubes.
 *
 * Each cube is three rhombi sharing a centre, drawn in the cut-out colour and
 * separated by the plate showing through -- which is what gives a flat shape
 * its corner. They sit on a plain grid with a gap all round, as on the studio's
 * panel: every cube whole, none touching.
 */
export function CubeBand({ x, y, width, height, color, ground, uid }: CubeBandProps) {
  /*
   * Sized so a band of the proportions the studio cuts comes out six cubes
   * across and eleven down, as the panel does. The steps are just wider than a
   * cube, which leaves the even gap the laser needs and stops two cubes'
   * faces running into one another.
   */
  const S = 38;
  const w = S / 2;
  const q = S / 4;
  const stepX = S * 1.22;
  const stepY = S * 1.3;

  /*
   * The field is snapped down to whole tiles and centred in the space given.
   *
   * A band whose height happened to fall mid-tile sliced the top and bottom
   * rows in half, and a half cube is not a shape anybody cuts -- it reads as
   * the drawing having run out rather than as a panel. Losing up to one row to
   * keep every cube whole is the right trade.
   */
  const cols = Math.max(1, Math.floor(width / stepX));
  const rows = Math.max(1, Math.floor(height / stepY));
  const fieldW = cols * stepX;
  const fieldH = rows * stepY;
  const originX = x + (width - fieldW) / 2;
  const originY = y + (height - fieldH) / 2;

  const cube = (key: string, cubeX: number, cubeY: number) => (
    <g key={key} transform={`translate(${cubeX} ${cubeY})`}>
      <path d={`M0 ${-2 * q} L${w} ${-q} L0 0 L${-w} ${-q} Z`} />
      <path d={`M${-w} ${-q} L0 0 L0 ${2 * q} L${-w} ${q} Z`} />
      <path d={`M${w} ${-q} L0 0 L0 ${2 * q} L${w} ${q} Z`} />
    </g>
  );

  return (
    <>
      <defs>
        <pattern
          id={`cubes-${uid}`}
          patternUnits="userSpaceOnUse"
          x={originX}
          y={originY}
          width={stepX}
          height={stepY}
        >
          <g fill={color} stroke={ground} strokeWidth="2.2" strokeLinejoin="round">
            {cube('a', stepX / 2, stepY * 0.5)}
          </g>
        </pattern>
      </defs>
      <rect x={originX} y={originY} width={fieldW} height={fieldH} fill={`url(#cubes-${uid})`} />
    </>
  );
}
