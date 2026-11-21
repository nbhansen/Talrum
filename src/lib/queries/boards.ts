// Barrel re-export. Reads live in `./boards.read`, mutations in
// `./boards.mutations`. Kept so the import sites consuming
// `@/lib/queries/boards` don't need to churn.
export * from './boards.mutations';
export * from './boards.read';
