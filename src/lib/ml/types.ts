/** Shared ML constants/types without Node-only dependencies (safe for client components). */
export const QUADRANTS = ['PAHAM_KONSEP', 'LUCKY_GUESS', 'MISKONSEPSI', 'TIDAK_PAHAM'] as const;
export type Quadrant = (typeof QUADRANTS)[number];
