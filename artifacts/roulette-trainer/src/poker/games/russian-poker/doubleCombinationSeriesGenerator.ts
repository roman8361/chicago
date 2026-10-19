export interface SeriesDeal {
  id: string;
  cards: readonly string[];
}

export interface SeriesGroup {
  id: string;
  name: string;
  deals: readonly SeriesDeal[];
}

export interface RussianPokerSeriesRound {
  groupId: string;
  groupName: string;
  dealId: string;
  cards: string[];
  roundNumber: number;
}

export interface GenerateRussianPokerSeriesOptions {
  groups: readonly SeriesGroup[];
  selectedGroupIds: readonly string[];
  roundCount: number;
  random?: () => number;
}

function randomIndex(length: number, random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) throw new Error("Генератор случайных чисел вернул некорректное значение.");
  return Math.floor(Math.min(Math.max(value, 0), 0.9999999999999999) * length);
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = randomIndex(index + 1, random);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function uniqueDeals(deals: readonly SeriesDeal[]): SeriesDeal[] {
  const unique = new Map<string, SeriesDeal>();
  for (const deal of deals) {
    const key = [...deal.cards].sort().join("|");
    if (!unique.has(key)) unique.set(key, deal);
  }
  return [...unique.values()];
}

function canFinishWithoutAdjacentGroup(
  remaining: ReadonlyMap<string, number>,
  previousGroupId: string,
): boolean {
  const remainingCount = [...remaining.values()].reduce((sum, count) => sum + count, 0);
  if (remainingCount === 0) return true;

  const previousCount = remaining.get(previousGroupId) ?? 0;
  if (previousCount > Math.floor(remainingCount / 2)) return false;

  const maxOtherCount = Math.ceil(remainingCount / 2);
  for (const [groupId, count] of remaining) {
    if (groupId !== previousGroupId && count > maxOtherCount) return false;
  }
  return true;
}

function createGroupOrder(
  quotas: ReadonlyMap<string, number>,
  random: () => number,
): string[] {
  const activeGroups = [...quotas].filter(([, count]) => count > 0).map(([id]) => id);
  const totalRounds = [...quotas.values()].reduce((sum, count) => sum + count, 0);
  if (activeGroups.length <= 1) {
    const onlyGroup = activeGroups[0];
    return onlyGroup ? Array.from({ length: totalRounds }, () => onlyGroup) : [];
  }

  const remaining = new Map(quotas);
  const sequence: string[] = [];
  let previousGroupId = "";

  while (sequence.length < totalRounds) {
    const candidates = [...remaining]
      .filter(([, count]) => count > 0)
      .filter(([groupId]) => groupId !== previousGroupId)
      .filter(([groupId, count]) => {
        const afterChoice = new Map(remaining);
        afterChoice.set(groupId, count - 1);
        return canFinishWithoutAdjacentGroup(afterChoice, groupId);
      })
      .map(([groupId]) => groupId);

    if (candidates.length === 0) {
      throw new Error("Не удалось построить чередование групп при заданном распределении.");
    }

    const groupId = candidates[randomIndex(candidates.length, random)];
    sequence.push(groupId);
    remaining.set(groupId, (remaining.get(groupId) ?? 0) - 1);
    previousGroupId = groupId;
  }

  return sequence;
}

function takeDealsWithoutPrematureRepeats(
  deals: readonly SeriesDeal[],
  count: number,
  random: () => number,
): SeriesDeal[] {
  const pool = uniqueDeals(deals);
  if (pool.length === 0) return [];

  const chosen: SeriesDeal[] = [];
  let previousSignature: string | null = null;

  while (chosen.length < count) {
    const nextCycle = shuffle(pool, random);
    if (nextCycle.length > 1 && previousSignature !== null) {
      const firstSignature = [...nextCycle[0].cards].sort().join("|");
      if (firstSignature === previousSignature) {
        const swapIndex = nextCycle.findIndex(
          (deal) => [...deal.cards].sort().join("|") !== previousSignature,
        );
        if (swapIndex > 0) {
          [nextCycle[0], nextCycle[swapIndex]] = [nextCycle[swapIndex], nextCycle[0]];
        }
      }
    }

    const takeCount = Math.min(pool.length, count - chosen.length);
    const cycleSlice = nextCycle.slice(0, takeCount);
    chosen.push(...cycleSlice);
    previousSignature = [...cycleSlice[cycleSlice.length - 1].cards].sort().join("|");
  }

  return chosen;
}

export function generateRussianPokerSeries({
  groups,
  selectedGroupIds,
  roundCount,
  random = Math.random,
}: GenerateRussianPokerSeriesOptions): RussianPokerSeriesRound[] {
  if (!Number.isInteger(roundCount) || roundCount < 1 || roundCount > 100) {
    throw new Error("Количество раздач должно быть целым числом от 1 до 100.");
  }

  const selectedIds = [...new Set(selectedGroupIds)];
  if (selectedIds.length === 0) {
    throw new Error("Выберите хотя бы одну группу комбинаций");
  }

  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const unknownGroupIds = selectedIds.filter((groupId) => !groupsById.has(groupId));
  if (unknownGroupIds.length > 0) {
    throw new Error(`В настройках выбраны отсутствующие группы: ${unknownGroupIds.join(", ")}.`);
  }

  const selectedGroups = selectedIds.map((groupId) => groupsById.get(groupId)!);
  const emptyGroups = selectedGroups.filter((group) => uniqueDeals(group.deals).length === 0);
  if (emptyGroups.length > 0) {
    throw new Error(`В выбранных группах нет корректных раздач: ${emptyGroups.map((group) => group.name).join(", ")}.`);
  }

  const quotas = new Map<string, number>();
  const baseCount = Math.floor(roundCount / selectedGroups.length);
  const remainder = roundCount % selectedGroups.length;
  for (const group of selectedGroups) quotas.set(group.id, baseCount);

  for (const group of shuffle(selectedGroups, random).slice(0, remainder)) {
    quotas.set(group.id, (quotas.get(group.id) ?? 0) + 1);
  }

  const groupSequence = createGroupOrder(quotas, random);
  const dealsByGroup = new Map<string, SeriesDeal[]>();
  for (const group of selectedGroups) {
    dealsByGroup.set(
      group.id,
      takeDealsWithoutPrematureRepeats(group.deals, quotas.get(group.id) ?? 0, random),
    );
  }

  const dealOffsets = new Map<string, number>();
  return groupSequence.map((groupId, index) => {
    const group = groupsById.get(groupId)!;
    const offset = dealOffsets.get(groupId) ?? 0;
    const deal = dealsByGroup.get(groupId)?.[offset];
    if (!deal) {
      throw new Error(`Не удалось выбрать раздачу для группы «${group.name}».`);
    }
    dealOffsets.set(groupId, offset + 1);
    return {
      groupId,
      groupName: group.name,
      dealId: deal.id,
      cards: [...deal.cards],
      roundNumber: index + 1,
    };
  });
}
