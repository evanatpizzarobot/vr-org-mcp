/**
 * Pure builders for the MCP prompt templates. Each returns the user-message text
 * that steers the model to answer using VR.org's tools and resources. Kept pure
 * so the wording is unit-testable and stays identical to the remote endpoint.
 */

import { sanitizeReflectedValue } from "./security/sanitize.js";

export function recommendHeadsetPrompt(args: { budget?: string; use_case?: string }): string {
  const budget = args.budget?.trim() || "no strict budget";
  const useCase = args.use_case?.trim() || "general VR use";
  return [
    "I want a VR headset recommendation grounded in VR.org's current picks.",
    "",
    `Budget: ${sanitizeReflectedValue(budget)}`,
    `Main use: ${sanitizeReflectedValue(useCase)}`,
    "",
    "Use the compare_vr_headsets and get_vr_deals tools plus vr_explain (topic 'best headset') to base your answer on VR.org's live catalog and prices. Give one primary pick and one alternative, each with a one-line reason and the current price, then link the VR.org best-vr-headsets guide.",
  ].join("\n");
}

export function thisWeekInVrPrompt(args: { category?: string }): string {
  const cat = args.category?.trim();
  return [
    `Write a concise "This Week in VR" roundup${cat ? ` focused on ${sanitizeReflectedValue(cat)}` : ""}.`,
    "",
    `Use search_vr_news${cat ? ` (category ${sanitizeReflectedValue(cat)})` : ""} and list_vr_originals to gather the most significant VR, AR, and XR stories from roughly the past week. Pick the 5 to 8 that matter most, group them by theme, summarize each in one or two sentences with its link, and end with a line on what to watch next.`,
  ].join("\n");
}

export function explainVrTopicPrompt(args: { topic?: string }): string {
  const topic = args.topic?.trim() || "virtual reality";
  return [
    `Explain "${sanitizeReflectedValue(topic)}" clearly for someone new to VR.`,
    "",
    "First call vr_explain with this topic to get VR.org's canonical answer and authoritative pillar-page link. Then expand it into a clear, accurate explanation in plain language, fill any gaps, and cite the VR.org guide you used.",
  ].join("\n");
}
