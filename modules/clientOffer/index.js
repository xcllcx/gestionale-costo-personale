/**
 * Offerta Cliente — entry point.
 */

import {
  ensureClientOfferState,
  loadClientOfferFromStorage,
  createDefaultClientOfferState
} from "./state.js";
import {
  initClientOfferUi,
  refreshClientOfferView
} from "./clientOfferUi.js?v=rev04-margin-fix-20260828";

export { refreshClientOfferView, createDefaultClientOfferState };
export * from "./transform.js?v=rev04-margin-fix-20260828";
export * from "./import.js";
export * from "./state.js";
export {
  generateClientOfferDocx,
  cleanupEmptyOptionalParagraphs,
  OPTIONAL_ROW_KEYS
} from "./wordGenerator.js";

export function initClientOffer(appState) {
  ensureClientOfferState(appState);
  loadClientOfferFromStorage(appState);
  initClientOfferUi(appState);
}
