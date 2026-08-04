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
  `A pictogram for a child's communication board showing: ${label}. ` +
  'One single subject, centered, filling most of the frame. ' +
  'Flat vector illustration style with thick clean outlines and soft muted colors. ' +
  'Plain solid off-white background. No text, no letters, no numbers, no symbols. ' +
  'Calm, friendly, minimal detail, no background scenery. ' +
  'The label may be in Danish.';
