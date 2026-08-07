/**
 * The one style template for generated pictograms (#422); the label is the only
 * variable part. Consistency is a requirement, not taste: a stylistically
 * random symbol set is a regression for the child. Hence provider-neutral —
 * swapping providers must not change how pictograms look.
 */
export const buildImagePrompt = (label: string): string =>
  // The "usually Danish" lead and the quotes both matter: a trailing hint lost
  // against the English template, and short Danish phrases were read as English
  // ("i bad" became a sad child, not a bath). Verified against the live model.
  `A pictogram for a child's communication board. ` +
  `The board is used by a Danish family, so the label is usually Danish: "${label}". ` +
  'Show what the label means. ' +
  'One single subject, centered, filling most of the frame. ' +
  'Flat vector illustration style with thick clean outlines and soft muted colors. ' +
  'Plain solid off-white background. No text, no letters, no numbers, no symbols. ' +
  'Calm, friendly, minimal detail, no background scenery.';
