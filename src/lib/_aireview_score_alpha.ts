export interface AlphaScoreInput {
  attempts: number;
  hintsUsed: number;
  timeMs: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export function computeAlphaScore(input: AlphaScoreInput): number {
  const difficultyMultiplier =
    input.difficulty === 'hard' ? 3 : input.difficulty === 'medium' ? 2 : 1;
  const basePoints = 100 * difficultyMultiplier;
  const hintPenalty = input.hintsUsed * 15;
  const attemptPenalty = Math.max(0, input.attempts - 1) * 10;
  const timeBonus = input.timeMs < 30000 ? 50 : input.timeMs < 60000 ? 25 : 0;
  const raw = basePoints - hintPenalty - attemptPenalty + timeBonus;
  if (raw < 0) return 0;
  if (raw > 500) return 500;
  return raw;
}
