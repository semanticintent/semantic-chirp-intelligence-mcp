/**
 * 🏒 Chirp Styles Configuration
 *
 * Defines the tone and energy levels for chirp intelligence responses.
 * Each style maps to a semantic context for how the system communicates.
 *
 * Governance Note:
 * These are semantic descriptors, not technical configurations.
 * The style choice drives the semantic approach to response generation.
 */

export const CHIRP_STYLES = {
  gentle: {
    tone: "encouraging",
    energy: "supportive",
    prefix: "Consider",
    suffix: "when you're ready"
  },
  standard: {
    tone: "direct_honest",
    energy: "confident",
    prefix: "Time to",
    suffix: "and improve your game"
  },
  savage: {
    tone: "brutal_truth",
    energy: "aggressive",
    prefix: "Bro,",
    suffix: "Get it together!"
  },
  ice_cold: {
    tone: "championship_enforcer",
    energy: "intimidating_confidence",
    prefix: "Listen up, future champion -",
    suffix: "That's how legends are made."
  }
} as const;
