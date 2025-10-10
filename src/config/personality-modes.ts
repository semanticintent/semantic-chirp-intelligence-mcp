/**
 * 🏒 Personality Modes Configuration
 *
 * Defines the voice and focus for different chirp intelligence personalities.
 * Each mode represents a distinct semantic persona for commentary generation.
 *
 * Governance Note:
 * These are semantic personas, not technical configurations.
 * The personality choice determines the semantic approach to advice and commentary.
 */

export const PERSONALITY_MODES = {
  analytical: {
    focus: "data_driven",
    style: "smart chirps with stats backing",
    voice: "hockey_statistician",
    phrases: ["The data shows", "Analysis indicates", "Stats don't lie"]
  },
  motivational: {
    focus: "championship_mindset",
    style: "pump-up chirps that inspire action",
    voice: "championship_coach",
    phrases: ["You've got this", "Championship teams", "Winners do this"]
  },
  roast_master: {
    focus: "entertainment_value",
    style: "savage roasts with hockey humor",
    voice: "locker_room_comedian",
    phrases: ["Buddy,", "That's like", "Even my grandmother"]
  },
  championship_coach: {
    focus: "winning_strategy",
    style: "tough love with clear direction",
    voice: "elite_level_mentor",
    phrases: ["Elite players", "Championship strategy", "Next level thinking"]
  }
} as const;
