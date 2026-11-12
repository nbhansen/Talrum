// Whole sentences, not a language name in a template: the Danish wording is the
// one verified against the live model.
const LABEL_LEAD = {
  da: 'The board is used by a Danish family, so the label is usually Danish',
  en: 'The board is used by an English-speaking family, so the label is usually English',
} as const;

/** Languages the function accepts. A closed set: the value picks a sentence. */
export type PromptLanguage = keyof typeof LABEL_LEAD;

export const isPromptLanguage = (v: unknown): v is PromptLanguage =>
  typeof v === 'string' && Object.hasOwn(LABEL_LEAD, v);

/**
 * The one style template for generated pictograms (#422); the label and its
 * language are the only variable parts. Consistency is a requirement, not taste:
 * a stylistically random symbol set is a regression for the child. Hence
 * provider-neutral — swapping providers must not change how pictograms look.
 */
export const buildImagePrompt = (label: string, language: PromptLanguage): string =>
  // The language lead and the quotes both matter: a trailing hint lost against
  // the English template, and short Danish phrases were read as English
  // ("i bad" became a sad child, not a bath). Verified against the live model.
  `A pictogram for a child's communication board. ` +
  `${LABEL_LEAD[language]}: "${label}". ` +
  'Show what the label means. ' +
  'One single subject, centered, filling most of the frame. ' +
  'Flat vector illustration style with thick clean outlines and soft muted colors. ' +
  'Plain solid off-white background. No text, no letters, no numbers, no symbols. ' +
  'Calm, friendly, minimal detail, no background scenery.';
