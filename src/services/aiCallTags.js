/**
 * callTag obbligatori per askAI / callGemini.
 * Solo etichette tecniche: mai prompt o dati sanitari.
 */

export const AI_CALL_TAGS = Object.freeze({
  FOCUS_AI_COACH: 'focus_ai_coach',
  CHAT_STRUCTURED: 'chat_structured',
  CHAT_CONSULTANT: 'chat_consultant',
  HEALTH_ANALYZER_REPORT: 'health_analyzer_report',
  HEALTH_ANALYZER_LABELS: 'health_analyzer_labels',
  SEMANTIC_MATCH: 'semantic_match',
  SEMANTIC_SPELL: 'semantic_spell',
  VISION_LABEL: 'vision_label',
  VOICE_TRANSCRIBE: 'voice_transcribe',
  PROTOCOL_TIMELINE: 'protocol_timeline',
  WAVE_NUTRITION: 'wave_nutrition',
  DRAFT_PARSER: 'draft_parser',
  HEALTH_CHAT: 'health_chat',
  MEAL_BUILDER: 'meal_builder',
  AI_COACH_ACTION: 'ai_coach_action',
  PROJECTED_AGE: 'projected_age',
  GENERIC: 'client_generic',
});
