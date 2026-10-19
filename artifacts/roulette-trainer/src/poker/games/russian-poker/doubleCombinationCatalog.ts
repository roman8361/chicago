import rawDoubleCombinations from "./double-combinations.json?raw";
import {
  validateDoubleCombinationData,
  type DoubleCombinationCatalog,
} from "./doubleCombinationCatalogValidation";

export {
  getUniqueCardDeals,
  validateDoubleCombinationData,
  type DoubleCombinationCatalog,
  type DoubleCombinationDeal,
  type DoubleCombinationGroup,
} from "./doubleCombinationCatalogValidation";

let cachedCatalog: DoubleCombinationCatalog | null = null;

export function getDoubleCombinationCatalog(): DoubleCombinationCatalog {
  if (!cachedCatalog) cachedCatalog = validateDoubleCombinationData(rawDoubleCombinations);
  return cachedCatalog;
}
