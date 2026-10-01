/**
 * Product videos.
 *
 * A studio pastes whatever link it has — the address bar on YouTube, a share
 * link, a Vimeo page, or a direct file somewhere. This works out what was
 * meant and how to play it, so the admin never has to ask for "the embed URL".
 *
 * Nothing is fetched here: a link is read, not verified. An unreachable video
 * fails in the player, where the browser can say so, rather than at save time.
 */

export type VideoKind = 'youtube' | 'vimeo' | 'file';

export interface ResolvedVideo {
  kind: VideoKind;
  /** What to put in an iframe src, or in a <video> src for a file. */
  src: string;
  /** YouTube and Vimeo only — used for the poster before it plays. */
  thumbnail?: string;
}

const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i;
const VIMEO_ID = /vimeo\.com\/(?:video\/|channels\/[\w]+\/|groups\/[\w]+\/videos\/)?(\d+)/i;
const FILE_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;

/** Reads a pasted link, or null when it is not a video we can play. */
export function resolveVideo(raw: string | null | undefined): ResolvedVideo | null {
  const url = String(raw ?? '').trim();
  if (!url) return null;

  const youtube = url.match(YOUTUBE_ID);
  if (youtube) {
    return {
      kind: 'youtube',
      // `rel=0` keeps the end screen to this channel, and no autoplay: a video
      // that starts on its own in a product gallery is an ambush.
      src: `https://www.youtube-nocookie.com/embed/${youtube[1]}?rel=0`,
      thumbnail: `https://i.ytimg.com/vi/${youtube[1]}/hqdefault.jpg`,
    };
  }

  const vimeo = url.match(VIMEO_ID);
  if (vimeo) {
    return { kind: 'vimeo', src: `https://player.vimeo.com/video/${vimeo[1]}` };
  }

  // A file we serve ourselves, or one hosted anywhere with a playable
  // extension. Anything else is not something a <video> tag can open.
  if (url.startsWith('/uploads/') || FILE_EXT.test(url)) {
    return { kind: 'file', src: url };
  }

  return null;
}

/** A sentence for the admin when a link cannot be played. */
export const VIDEO_HELP =
  'Paste a YouTube or Vimeo link, or a direct link to an .mp4 or .webm file.';
