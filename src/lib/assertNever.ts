/**
 * Exhaustiveness helper. Call in the `default` branch of a `switch` over a
 * discriminated union; a compile error signals a missing case.
 */
export const assertNever = (value: never): never => {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
};
