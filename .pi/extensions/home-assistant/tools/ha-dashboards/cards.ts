/**
 * Dashboard card operations — add, update, remove, move.
 *
 * All modifications fetch the full config, modify cards[], and save back.
 * Cards are identified by view_index + card_index.
 */
import {
  fetchDashboardConfig,
  saveDashboardConfig,
  resolveViewIndex,
  type CardConfig,
} from "./types.js";

// ── Helpers ──────────────────────────────────────────────────

function getViewCards(
  views: Record<string, unknown>[],
  viewIdx: number
): { cards: CardConfig[]; isSection: false } | { cards: CardConfig[]; isSection: true; sectionIdx: number } {
  const view = views[viewIdx] as Record<string, unknown>;

  // Classic layout: cards[] on the view
  if (Array.isArray(view.cards)) {
    return { cards: view.cards as CardConfig[], isSection: false };
  }

  // Section layout: sections[].cards[] — for now, error and tell user
  if (Array.isArray(view.sections)) {
    throw new Error(
      `View ${viewIdx} uses sections layout. Section-based card editing is not yet supported. ` +
      `Use get-view to see the full config and update-view to modify sections directly.`
    );
  }

  // No cards yet — initialize
  view.cards = [];
  return { cards: view.cards as CardConfig[], isSection: false };
}

function validateCardIndex(cards: CardConfig[], cardIndex: number | undefined, action: string): number {
  if (cardIndex === undefined) {
    throw new Error(`'card_index' is required for ${action}`);
  }
  if (cardIndex < 0 || cardIndex >= cards.length) {
    throw new Error(`Card index ${cardIndex} out of range (0-${cards.length - 1})`);
  }
  return cardIndex;
}

// ── Add Card ─────────────────────────────────────────────────

export async function handleAddCard(params: Record<string, unknown>): Promise<string> {
  const urlPath = params.url_path as string | undefined;
  const cardConfig = params.card_config as CardConfig | undefined;

  if (!cardConfig) {
    throw new Error("'card_config' is required for add-card. Must include 'type' field.");
  }
  if (!cardConfig.type) {
    throw new Error("'card_config.type' is required (e.g., 'tile', 'entities', 'custom:mushroom-entity-card')");
  }

  const config = await fetchDashboardConfig(urlPath);
  const views = config.views || [];

  if (views.length === 0) {
    throw new Error("Dashboard has no views. Use add-view first.");
  }

  const viewIdx = resolveViewIndex(
    views,
    params.view_index as number | undefined,
    params.view_path as string | undefined
  );

  const { cards } = getViewCards(views, viewIdx);
  const position = params.position as number | undefined;

  if (position !== undefined) {
    if (position < 0 || position > cards.length) {
      throw new Error(`Position ${position} out of range (0-${cards.length})`);
    }
    cards.splice(position, 0, cardConfig);
  } else {
    cards.push(cardConfig);
  }

  await saveDashboardConfig(urlPath, config);

  const idx = position ?? cards.length - 1;
  return `✅ Added ${cardConfig.type} card at view ${viewIdx}, card index ${idx}`;
}

// ── Update Card ──────────────────────────────────────────────

export async function handleUpdateCard(params: Record<string, unknown>): Promise<string> {
  const urlPath = params.url_path as string | undefined;
  const cardConfig = params.card_config as Record<string, unknown> | undefined;

  if (!cardConfig) {
    throw new Error("'card_config' is required for update-card");
  }

  const config = await fetchDashboardConfig(urlPath);
  const views = config.views || [];

  const viewIdx = resolveViewIndex(
    views,
    params.view_index as number | undefined,
    params.view_path as string | undefined
  );

  const { cards } = getViewCards(views, viewIdx);
  const cardIdx = validateCardIndex(cards, params.card_index as number | undefined, "update-card");

  // Replace the entire card config (not merge — card type might change)
  if (cardConfig.type) {
    // Full replacement
    cards[cardIdx] = cardConfig as CardConfig;
  } else {
    // Merge with existing (keep type)
    cards[cardIdx] = { ...cards[cardIdx], ...cardConfig };
  }

  await saveDashboardConfig(urlPath, config);

  return `✅ Updated card ${cardIdx} in view ${viewIdx} (type: ${cards[cardIdx].type})`;
}

// ── Remove Card ──────────────────────────────────────────────

export async function handleRemoveCard(params: Record<string, unknown>, confirm?: boolean): Promise<string> {
  const urlPath = params.url_path as string | undefined;
  const config = await fetchDashboardConfig(urlPath);
  const views = config.views || [];

  const viewIdx = resolveViewIndex(
    views,
    params.view_index as number | undefined,
    params.view_path as string | undefined
  );

  const { cards } = getViewCards(views, viewIdx);
  const cardIdx = validateCardIndex(cards, params.card_index as number | undefined, "remove-card");

  if (!confirm) {
    return `⚠️ **Confirm remove-card**: card ${cardIdx} from view ${viewIdx} (type: ${cards[cardIdx]?.type})\n\nCall again with \`confirm: true\` to proceed.`;
  }

  const removed = cards.splice(cardIdx, 1)[0];
  await saveDashboardConfig(urlPath, config);

  return `✅ Removed card ${cardIdx} from view ${viewIdx} (was: ${removed.type})`;
}

// ── Move Card ────────────────────────────────────────────────

export async function handleMoveCard(params: Record<string, unknown>): Promise<string> {
  const urlPath = params.url_path as string | undefined;
  const position = params.position as number | undefined;
  const targetViewIndex = params.target_view_index as number | undefined;

  if (position === undefined && targetViewIndex === undefined) {
    throw new Error("Provide 'position' (within same view) and/or 'target_view_index' (move to different view)");
  }

  const config = await fetchDashboardConfig(urlPath);
  const views = config.views || [];

  const sourceViewIdx = resolveViewIndex(
    views,
    params.view_index as number | undefined,
    params.view_path as string | undefined
  );

  const { cards: sourceCards } = getViewCards(views, sourceViewIdx);
  const cardIdx = validateCardIndex(sourceCards, params.card_index as number | undefined, "move-card");

  // Remove from source
  const [card] = sourceCards.splice(cardIdx, 1);

  // Determine target
  const destViewIdx = targetViewIndex ?? sourceViewIdx;
  if (destViewIdx < 0 || destViewIdx >= views.length) {
    throw new Error(`Target view index ${destViewIdx} out of range (0-${views.length - 1})`);
  }

  const { cards: destCards } = getViewCards(views, destViewIdx);
  const destPos = position ?? destCards.length;

  if (destPos < 0 || destPos > destCards.length) {
    throw new Error(`Target position ${destPos} out of range (0-${destCards.length})`);
  }

  destCards.splice(destPos, 0, card);
  await saveDashboardConfig(urlPath, config);

  if (destViewIdx === sourceViewIdx) {
    return `✅ Moved ${card.type} card from position ${cardIdx} to ${destPos} in view ${sourceViewIdx}`;
  }
  return `✅ Moved ${card.type} card from view ${sourceViewIdx}[${cardIdx}] to view ${destViewIdx}[${destPos}]`;
}
