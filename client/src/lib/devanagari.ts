/**
 * Roman spelling into Devanagari, for people without a Hindi keyboard.
 *
 * Asking a customer to type कुलकर्णी is asking most of them to give up, so
 * they type "Kulkarni" and are shown what that becomes. This is the shown
 * part. It runs in the browser and nothing is sent anywhere: a name is the
 * most personal thing on the order, and it has no business travelling to a
 * third party to be spelled.
 *
 * ---- What it can and cannot know ----
 *
 * Roman spelling of Indian names throws away distinctions Devanagari keeps.
 * "t" is त or ट, "d" is द or ड, "n" is न or ण, and nothing in the letters
 * says which; "Patel" is पटेल with a retroflex ट, "Mitra" is मित्र with a
 * dental त. No converter can be right every time, and the ones that come
 * closest do it by looking names up rather than by rule.
 *
 * So this is built to be a good first guess and never the last word. Every
 * conversion is shown to the customer beside what they typed, and what gets
 * cut is the Devanagari they approve, not the Roman they entered. The rules
 * below encode the conventions Indian names actually use -- "aa" long, "ee"
 * for ी, "sh" for श, a retroflex after "r" -- which is what makes the guess
 * right often enough to be worth offering.
 *
 * Anything not Latin passes through untouched, so a customer who does have a
 * Devanagari keyboard, or who pastes, is never fought with.
 */

/** Independent vowels, used at the start of a word. */
const VOWEL_LETTERS: Record<string, string> = {
  aa: 'आ', ai: 'ऐ', au: 'औ', ee: 'ई', ii: 'ई', oo: 'ऊ', uu: 'ऊ',
  ao: 'आव',
  a: 'अ', i: 'इ', u: 'उ', e: 'ए', o: 'ओ',
};

/** The same vowels as marks hung on a preceding consonant. */
const VOWEL_SIGNS: Record<string, string> = {
  aa: 'ा', ai: 'ै', au: 'ौ', ee: 'ी', ii: 'ी', oo: 'ू', uu: 'ू',
  ao: 'ाव',
  a: '', i: 'ि', u: 'ु', e: 'े', o: 'ो',
};

/**
 * Consonants, longest spelling first.
 *
 * Order is the whole trick: "chh" has to be tried before "ch", and "ch"
 * before "c", or "chhaya" comes out as च-ह-आ-य-आ.
 */
const CONSONANTS: [string, string][] = [
  ['chh', 'छ'], ['shh', 'ष'], ['ksh', 'क्ष'], ['ngh', 'ंह'], ['gy', 'ज्ञ'],
  ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'], ['th', 'थ'],
  ['dh', 'ध'], ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'], ['ng', 'ंग'],
  ['k', 'क'], ['g', 'ग'], ['c', 'च'], ['j', 'ज'], ['t', 'त'], ['d', 'द'],
  ['n', 'न'], ['p', 'प'], ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'],
  ['l', 'ल'], ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'], ['f', 'फ'],
  ['z', 'ज़'], ['q', 'क'], ['x', 'क्स'],
];

const VOWEL_KEYS = Object.keys(VOWEL_SIGNS).sort((a, b) => b.length - a.length);

/** A consonant straight after "r" is retroflex far more often than not. */
const RETROFLEX_AFTER_R: Record<string, string> = { न: 'ण', त: 'ट', द: 'ड' };

/**
 * A consonant that really does bind to the next one.
 *
 * Roman drops the inherent vowel, so most adjacent pairs are not clusters at
 * all -- see the note in word(). These are the two cases where they are: a
 * glide or liquid leaning back on the letter before it (Atharv अथर्व, Saanvi
 * सान्वी), and a handful of stop pairs no Indian name pulls apart (Gupta
 * गुप्ता). Deliberately short: every entry that is wrong knots a name that
 * should have stayed plain, which is the uglier failure.
 */
const GLIDES = new Set(['र', 'य', 'व']);
const CLUSTER_PAIRS = new Set(['pt', 'kt', 'st', 'sp', 'sk', 'ps', 'bd']);

/**
 * Consonants too light to pull the vowel before them long.
 *
 * "-ar", "-ash", "-al" endings carry a long ा -- Kumar कुमार, Prakash प्रकाश --
 * but "-an", "-ay", "-av" stay short: Kiran किरन, Sanjay संजय, Aarav आरव.
 */
const LIGHT_TAIL = new Set(['न', 'य', 'व']);

const VIRAMA = '्';

/** One Roman word into Devanagari. */
function word(input: string): string {
  const text = input.toLowerCase();
  let out = '';
  let i = 0;
  let lastWasR = false;
  let lastWasConsonant = false;

  while (i < text.length) {
    const rest = text.slice(i);
    const atStart = out === '';

    const consonant = CONSONANTS.find(([roman]) => rest.startsWith(roman));
    if (consonant) {
      const [roman, base] = consonant;
      const after = text.slice(i + roman.length);
      const nextIsConsonant = after.length > 0
        && CONSONANTS.some(([other]) => after.startsWith(other));

      /*
       * An "n" leaning on the next consonant is almost always the nasal mark,
       * not a full letter: Sanjay is संजय, Bhansali भंसाली, Chandni चंदनी.
       */
      const nextBase = nextIsConsonant
        ? (CONSONANTS.find(([other]) => after.startsWith(other)) as [string, string])[1]
        : '';
      /* A closing "y" is read below as the long i, so nothing binds to it. */
      const closingY = after === 'y';
      const binds = nextIsConsonant && !closingY
        && (nextBase === base || GLIDES.has(nextBase) || CLUSTER_PAIRS.has(roman + after[0]));

      /*
       * An "n" leaning on the next consonant is almost always the nasal mark,
       * not a full letter: Sanjay is संजय, Bhansali भंसाली, Chandni चंदनी.
       * Not before a glide, where it stays a letter and binds: Saanvi सान्वी.
       */
      if (base === 'न' && nextIsConsonant && !binds && !atStart) {
        out += 'ं';
        lastWasR = false;
        lastWasConsonant = false;
        i += roman.length;
        continue;
      }

      /*
       * "karn" is कर्ण, not कर्न. After an r, Indian names take the retroflex
       * far more often than the dental.
       */
      /*
       * A closing "y" hanging off a consonant is the long i, not the letter:
       * Reddy is रेड्डी. After a vowel it stays य -- Sanjay संजय.
       */
      if (base === 'य' && after === '' && !atStart && !out.endsWith('ा') && lastWasConsonant) {
        out += 'ी';
        lastWasR = false;
        lastWasConsonant = false;
        i += roman.length;
        continue;
      }

      out += lastWasR && RETROFLEX_AFTER_R[base] ? RETROFLEX_AFTER_R[base] : base;

      /*
       * A virama only after "r", and nowhere else.
       *
       * Roman spelling drops the inherent vowel Devanagari keeps writing:
       * "kulkarni" has no a between the l and the k, yet the word is कुलकर्णी
       * with a plain ल. Joining every pair of consonants gave कुल्कर्णि --
       * every name came back knotted into conjuncts. Telling a real cluster
       * from a dropped vowel needs the syllables, which the Roman does not
       * carry; r is the one case common enough to be worth encoding, and the
       * rest are left plain because that is the commoner shape by far.
       */
      if (binds || (base === 'र' && nextIsConsonant)) out += VIRAMA;
      lastWasConsonant = true;
      lastWasR = base === 'र';
      i += roman.length;
      continue;
    }

    const vowel = VOWEL_KEYS.find((key) => rest.startsWith(key));
    if (vowel) {
      const isFinal = i + vowel.length >= text.length;
      /*
       * The last vowel of a name is long far more often than the Roman shows.
       * Hindi drops the inherent a in speech, so a written final a is the long
       * one -- Sharma is शर्मा -- and a final i or u is almost always ी or ू:
       * Darji दर्जी, Khushbu खुशबू.
       */
      /*
       * Two endings a letter-by-letter reading gets wrong on common names: a
       * closing "ai" is two vowels and not the ऐ ligature (Desai देसाई, never
       * देसै), and the same for "au".
       */
      if (isFinal && !atStart && (vowel === 'ai' || vowel === 'au')) {
        out += vowel === 'ai' ? 'ाई' : 'ाऊ';
        lastWasR = false;
        lastWasConsonant = false;
        i += vowel.length;
        continue;
      }

      let key = isFinal && (vowel === 'a' || vowel === 'i' || vowel === 'u')
        ? { a: 'aa', i: 'ee', u: 'oo' }[vowel]
        : vowel;

      /*
       * The "a" of the closing syllable is usually the long one, which Roman
       * writes the same as the short: Prakash प्रकाश, Kumar कुमार, Shah शाह,
       * Bhansali भंसाली. Only the closing one -- an "a" with more word after it
       * stays short, which is what keeps Patel पतेल and Sharma शर्मा off ा.
       */
      if (vowel === 'a' && !isFinal) {
        const rest2 = text.slice(i + vowel.length);
        const tailC = CONSONANTS.find(([other]) => rest2.startsWith(other));
        if (tailC && !LIGHT_TAIL.has(tailC[1])) {
          const tail = rest2.slice(tailC[0].length);
          const tailV = VOWEL_KEYS.find((k) => tail.startsWith(k));
          if (tail === '' || (tailV && tailV.length === tail.length)) key = 'aa';
        }
      }
      out += atStart ? VOWEL_LETTERS[key] : VOWEL_SIGNS[key];
      lastWasR = false;
      lastWasConsonant = false;
      i += vowel.length;
      continue;
    }

    // Anything else -- an apostrophe, a stray mark -- is kept as it is.
    out += text[i];
    lastWasR = false;
    i += 1;
  }

  return out;
}

/**
 * Converts the Latin runs of a string and leaves everything else alone.
 *
 * Mixed input is normal here -- "A-101" beside a name, or a customer who has
 * typed half in Devanagari already -- and rewriting what is not Latin would
 * undo their work.
 */
export function toDevanagari(input: string): string {
  if (!input) return '';
  /*
   * A single letter is an initial or a block marker -- the A of A-101, the B
   * of B Wing -- and is left exactly as typed. Turning it into आ was the one
   * conversion that was always wrong.
   */
  return input.replace(/[a-zA-Z]+/g, (run) => (run.length < 2 ? run : word(run)));
}

/** True when there is Latin here worth converting. */
export function hasLatin(input: string): boolean {
  return /[a-zA-Z]/.test(input);
}
