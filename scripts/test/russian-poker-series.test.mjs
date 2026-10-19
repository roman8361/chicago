import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateRussianPokerSeries } from "../../artifacts/roulette-trainer/src/poker/games/russian-poker/doubleCombinationSeriesGenerator.ts";
import {
  validateDoubleCombinationData,
} from "../../artifacts/roulette-trainer/src/poker/games/russian-poker/doubleCombinationCatalogValidation.ts";
import {
  getNextSeriesRoundIndex,
  isSeriesComplete,
} from "../../artifacts/roulette-trainer/src/poker/games/russian-poker/doubleCombinationSeriesState.ts";

const catalogPath = fileURLToPath(
  new URL("../../artifacts/roulette-trainer/src/poker/games/russian-poker/double-combinations.json", import.meta.url),
);

function seededRandom(seed = 982451653) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function makeGroups(groupCount, dealsPerGroup = 40) {
  return Array.from({ length: groupCount }, (_, groupIndex) => ({
    id: `group-${groupIndex + 1}`,
    name: `Group ${groupIndex + 1}`,
    deals: Array.from({ length: dealsPerGroup }, (_, dealIndex) => ({
      id: `group-${groupIndex + 1}-deal-${dealIndex + 1}`,
      cards: Array.from({ length: 6 }, (_, cardIndex) => (
        `card-${groupIndex + 1}-${dealIndex + 1}-${cardIndex + 1}`
      )),
    })),
  }));
}

function generate(groupCount, roundCount, dealsPerGroup = 40, seed = 982451653) {
  const groups = makeGroups(groupCount, dealsPerGroup);
  return {
    groups,
    plan: generateRussianPokerSeries({
      groups,
      selectedGroupIds: groups.map((group) => group.id),
      roundCount,
      random: seededRandom(seed),
    }),
  };
}

function countsByGroup(plan) {
  return plan.reduce((counts, round) => {
    counts.set(round.groupId, (counts.get(round.groupId) ?? 0) + 1);
    return counts;
  }, new Map());
}

function assertNoAdjacentGroups(plan) {
  for (let index = 1; index < plan.length; index++) {
    assert.notEqual(plan[index].groupId, plan[index - 1].groupId);
  }
}

function cardSetSignature(cards) {
  return [...cards].sort().join("|");
}

test("1. существующий JSON содержит проверяемые группы и корректные раздачи", async () => {
  const raw = await readFile(catalogPath, "utf8");
  const catalog = validateDoubleCombinationData(raw);

  assert.equal(catalog.fatalError, null);
  assert.deepEqual(catalog.errors, []);
  assert.equal(catalog.groups.length, 9);
  assert.ok(catalog.groups.every((group) => group.deals.length > 0));
  assert.ok(catalog.groups.every((group) => (
    group.deals.every((deal) => deal.cards.length === 6 && new Set(deal.cards).size === 6)
  )));
});

test("2. повреждённый JSON возвращает понятную fatal-ошибку без исключения", () => {
  const invalidJson = validateDoubleCombinationData("{broken");
  const invalidShape = validateDoubleCombinationData(JSON.stringify({ items: [] }));

  assert.match(invalidJson.fatalError, /JSON содержит синтаксическую ошибку/);
  assert.match(invalidShape.fatalError, /ожидается список groups/);
});

test("3. одна выбранная группа формирует все запрошенные раздачи", () => {
  const groups = makeGroups(2);
  const plan = generateRussianPokerSeries({
    groups,
    selectedGroupIds: [groups[1].id],
    roundCount: 10,
    random: seededRandom(),
  });

  assert.equal(plan.length, 10);
  assert.ok(plan.every((round) => round.groupId === groups[1].id));
});

test("4. десять раздач между тремя группами распределяются как 3, 3 и 4", () => {
  const { plan } = generate(3, 10);
  const values = [...countsByGroup(plan).values()].sort((a, b) => a - b);

  assert.equal(plan.length, 10);
  assert.deepEqual(values, [3, 3, 4]);
  assertNoAdjacentGroups(plan);
});

test("5. двадцать раздач между четырьмя группами распределяются поровну", () => {
  const { plan } = generate(4, 20);

  assert.deepEqual([...countsByGroup(plan).values()], [5, 5, 5, 5]);
  assertNoAdjacentGroups(plan);
});

test("6. одиннадцать раздач между тремя группами распределяются как 4, 4 и 3", () => {
  const { plan } = generate(3, 11, 40, 31);
  const values = [...countsByGroup(plan).values()].sort((a, b) => a - b);

  assert.deepEqual(values, [3, 4, 4]);
  assertNoAdjacentGroups(plan);
});

test("7. при двух раздачах и пяти группах выбираются две разные группы", () => {
  const { plan } = generate(5, 2);

  assert.equal(plan.length, 2);
  assert.notEqual(plan[0].groupId, plan[1].groupId);
  assert.deepEqual([...countsByGroup(plan).values()], [1, 1]);
});

test("8. одиннадцать раздач между двумя группами сбалансированы и чередуются", () => {
  const { plan } = generate(2, 11);
  const values = [...countsByGroup(plan).values()].sort((a, b) => a - b);

  assert.deepEqual(values, [5, 6]);
  assertNoAdjacentGroups(plan);
});

test("9. сто раздач между тремя группами сбалансированы и не идут подряд одной группой", () => {
  const { plan } = generate(3, 100);
  const values = [...countsByGroup(plan).values()].sort((a, b) => a - b);

  assert.equal(plan.length, 100);
  assert.deepEqual(values, [33, 33, 34]);
  assertNoAdjacentGroups(plan);

  for (let groupCount = 1; groupCount <= 9; groupCount++) {
    for (let roundCount = 1; roundCount <= 100; roundCount++) {
      const stressCase = generate(groupCount, roundCount, 100, groupCount * 1000 + roundCount);
      const groupCounts = [...countsByGroup(stressCase.plan).values()];
      assert.equal(stressCase.plan.length, roundCount);
      assert.ok(Math.max(...groupCounts) - Math.min(...groupCounts) <= 1);
      if (groupCounts.length > 1) assertNoAdjacentGroups(stressCase.plan);
    }
  }
});

test("10. уникальные раздачи одной группы не повторяются до исчерпания набора", () => {
  const { groups, plan } = generate(1, 10, 12);
  const signatures = plan.map((round) => cardSetSignature(round.cards));

  assert.equal(groups[0].deals.length, 12);
  assert.equal(new Set(signatures).size, 10);
});

test("11. после исчерпания набора начинается новый цикл без повтора на границе", () => {
  const { groups, plan } = generate(1, 25, 12, 43);
  const signatures = plan.map((round) => cardSetSignature(round.cards));
  const sourceSignatures = new Set(groups[0].deals.map((deal) => cardSetSignature(deal.cards)));

  assert.equal(plan.length, 25);
  assert.equal(new Set(signatures.slice(0, 12)).size, 12);
  assert.equal(new Set(signatures.slice(12, 24)).size, 12);
  assert.notEqual(signatures[11], signatures[12]);
  assert.ok(signatures.every((signature) => sourceSignatures.has(signature)));
});

test("12. единственная корректная раздача повторяется без зависания после исчерпания", () => {
  const groups = makeGroups(1, 1);
  const plan = generateRussianPokerSeries({
    groups,
    selectedGroupIds: [groups[0].id],
    roundCount: 25,
    random: seededRandom(),
  });

  assert.equal(plan.length, 25);
  assert.ok(plan.every((round) => round.dealId === groups[0].deals[0].id));
});

test("13. проверки блокируют пустой выбор, повторный переход и некорректное состояние серии", () => {
  const groups = makeGroups(1, 2);
  assert.throws(
    () => generateRussianPokerSeries({
      groups,
      selectedGroupIds: [],
      roundCount: 10,
      random: seededRandom(),
    }),
    /Выберите хотя бы одну группу комбинаций/,
  );
  assert.throws(
    () => generateRussianPokerSeries({
      groups,
      selectedGroupIds: [groups[0].id],
      roundCount: 101,
      random: seededRandom(),
    }),
    /от 1 до 100/,
  );

  const firstNextIndex = getNextSeriesRoundIndex({
    currentRoundIndex: 0,
    totalRounds: 2,
    roundState: "OPEN",
    transitionLocked: false,
  });
  assert.equal(firstNextIndex, 1);
  assert.equal(getNextSeriesRoundIndex({
    currentRoundIndex: 0,
    totalRounds: 2,
    roundState: "OPEN",
    transitionLocked: true,
  }), null);
  assert.equal(isSeriesComplete(1, 2, "OPEN"), true);
  assert.equal(isSeriesComplete(1, 2, "FLIPPING"), false);
  assert.equal(isSeriesComplete(0, 2, "OPEN"), false);

  const duplicateSetGroups = makeGroups(1, 2);
  duplicateSetGroups[0].deals[1].cards = [...duplicateSetGroups[0].deals[0].cards].reverse();
  const deduplicatedPlan = generateRussianPokerSeries({
    groups: duplicateSetGroups,
    selectedGroupIds: [duplicateSetGroups[0].id],
    roundCount: 4,
    random: seededRandom(),
  });
  assert.ok(deduplicatedPlan.every((round) => round.dealId === duplicateSetGroups[0].deals[0].id));
});
