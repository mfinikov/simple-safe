export const RAW = /(?<![A-Za-z0-9&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/;

/** CSS color keywords, which count as raw colors where a color goes. */
export const NAMED = new Set(['white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey', 'silver', 'navy', 'teal', 'aqua',
  'cyan', 'magenta', 'fuchsia', 'lime', 'maroon', 'olive', 'brown', 'gold', 'indigo', 'violet', 'coral', 'salmon', 'tomato', 'crimson', 'beige', 'ivory',
  'khaki', 'lavender', 'turquoise', 'tan', 'whitesmoke', 'gainsboro', 'lightgray', 'lightgrey', 'darkgray', 'darkgrey', 'dimgray', 'slategray']);

/**
 * Whether the arbitrary value `inside` the brackets of `base` is a hand-picked number. Transition lists, keywords,
 * proportions (a lone %, vh or vw, fr tracks) and values that read var(--) or --spacing() are fine.
 */
export function handPickedValue(base, inside) {
  // A grid track list in fr (grid-cols-[1fr_auto]) is a proportion, not a size.
  if (/^transition-\[/.test(base) || !/\d/.test(inside.replace(/(?<![\w.])\d+(?:\.\d+)?fr(?![a-z0-9])/g, ''))) return false;
  if (/^-?\d+(?:\.\d+)?(?:%|d?vh|svh|lvh|d?vw|svw|lvw)$/.test(inside)) return false;
  return !/var\(--|--spacing\(/.test(inside);
}
