/**
 * The colour a colour's name names.
 *
 * A plate offered in "Blue", "Navy" and "Forest" is offered in three colours
 * the words already describe, and asking the studio to set each one by hand
 * before a customer can see any of them puts a swatch behind a step nobody
 * knew to take. So a name that plainly names a colour is painted as that
 * colour, and anything the studio sets by hand wins over this.
 *
 * Null when the name says nothing about colour -- "Monsoon", "Edition Two" --
 * because painting a guessed square for those would be telling a customer
 * something untrue about what they are buying.
 */
const NAMED: [RegExp, string][] = [
  // Longer and more particular names first: navy is not any blue, forest is not any green.
  [/\bnavy\b|\bmidnight\b/, '#1B2A4A'],
  [/\broyal\s*blue\b/, '#1F4FA3'],
  [/\bsky\b|\bazure\b/, '#5BA7DD'],
  [/\bteal\b/, '#13797F'],
  [/\bforest\b|\bolive\b|\bbottle\b/, '#1F3B2E'],
  [/\bemerald\b|\bgreen\b/, '#2E7D32'],
  [/\bmaroon\b|\bburgundy\b|\bwine\b/, '#6E1B2A'],
  [/\bred\b|\bcherry\b|\bscarlet\b/, '#B3261E'],
  [/\borange\b|\brust\b|\bterracotta\b/, '#C2541B'],
  [/\byellow\b|\bmustard\b/, '#E0A91B'],
  [/\bpurple\b|\bviolet\b|\blavender\b|\bpurpule\b/, '#6B3FA0'],
  [/\bpink\b|\bblush\b/, '#D9748F'],
  [/\brose\s*gold\b/, '#B76E79'],
  [/\bgold\b|\bgolden\b|\bbrass\b/, '#C8A961'],
  [/\bcopper\b|\bbronze\b/, '#B87333'],
  [/\bsilver\b|\bchrome\b|\bsteel\b|\bnickel\b/, '#C9CCD1'],
  [/\bgrey\b|\bgray\b|\bgraphite\b|\bcharcoal\b/, '#6E7175'],
  [/\bwhite\b|\bivory\b|\bcream\b|\bpearl\b/, '#F3F1EC'],
  [/\bblack\b|\bmatt\b|\bmatte\b|\bonyx\b/, '#141414'],
  [/\bwood\b|\bteak\b|\boak\b|\bwalnut\b|\bbrown\b/, '#8B5A2B'],
  [/\bblue\b/, '#1F4FA3'],
];

export function colourFromName(value: string): string | null {
  const name = value.trim().toLowerCase();
  if (!name) return null;
  const found = NAMED.find(([pattern]) => pattern.test(name));
  return found ? found[1] : null;
}

/** A starting colour for the picker, which always has to open on something. */
export function colourGuess(value: string): string {
  return colourFromName(value) ?? '#C9CCD1';
}
