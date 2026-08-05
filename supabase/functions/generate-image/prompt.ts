/**
 * The one fixed style template for generated pictograms (#422). Every image
 * prompt goes through this function; the label is the only variable part.
 *
 * Style consistency is a hard requirement, not taste: generated pictograms
 * must read as one visual system across a board, because a stylistically
 * random symbol set is a regression for the child. That is why the template
 * lives here, provider-neutral, and not inside a provider file — swapping
 * providers must not change how pictograms look any more than it has to.
 */
export const buildImagePrompt = (label: string): string =>
  // The label leads with "usually Danish" and sits in quotes: a trailing
  // "may be in Danish" hint loses against the English template, so short
  // Danish phrases were read as English ("i bad" became a sad child, not a
  // bath). Verified against the live model with both a Danish and an
  // English label before this wording was chosen.
  `A pictogram for a child's communication board. ` +
  `The board is used by a Danish family, so the label is usually Danish: "${label}". ` +
  'Show what the label means. ' +
  'One single subject, centered, filling most of the frame. ' +
  'Flat vector illustration style with thick clean outlines and soft muted colors. ' +
  'Plain solid off-white background. No text, no letters, no numbers, no symbols. ' +
  'Calm, friendly, minimal detail, no background scenery.';
