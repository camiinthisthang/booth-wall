export interface PromotionCandidate {
  id: string;
  identifier: string;
  createdAt: string;
  votes: number;
}

export function selectPromotionCandidate(
  candidates: PromotionCandidate[],
): PromotionCandidate | null {
  return (
    candidates
      .filter((candidate) => candidate.votes > 0)
      .sort(
        (a, b) =>
          b.votes - a.votes ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}

export async function promoteAndReset(
  candidate: PromotionCandidate,
  promote: (id: string) => Promise<void>,
  reset: (id: string) => Promise<void>,
): Promise<void> {
  await promote(candidate.id);
  await reset(candidate.id);
}
