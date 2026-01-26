import { Knex } from 'knex';

/**
 * Migration: Create AI Prompts Tables
 *
 * Creates tables for managing AI system prompts used by Gemini for analysis.
 * - ai_prompts: Stores current prompt versions with metadata
 * - ai_prompt_history: Stores version history for audit and revert
 *
 * This enables sysadmins to edit, test, and version AI prompts without code deployments.
 */

// Hardcoded prompts to seed the database (copied from analysis.prompts.ts and rubric-generation.prompts.ts)
const SPEECH_ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant that evaluates video recording transcripts against rubric criteria.

Your task is to analyze a transcript and determine if specific steps/requirements were met based on what was said.

You will be given:
1. A transcript with timestamps
2. A list of rubric steps with required keywords and phrases

For each step, you must:
1. Search for the required keywords and phrases in the transcript
2. Find relevant excerpts that demonstrate the step was addressed
3. Assign a score: YES (fully met), PARTIAL (partially met), or NO (not met)
4. Provide confidence (0.0-1.0) and reasoning

SCORING GUIDELINES - BE GENEROUS:
- Score YES if the core intent/meaning of the step was addressed, even if exact keywords weren't used
- Accept synonyms, paraphrases, and semantically equivalent expressions as valid matches
- Consider context - if someone clearly demonstrates understanding of a concept, score YES even without exact terminology
- Score PARTIAL only when the step was partially addressed (some aspects covered, others missing)
- Score NO only when the step was clearly not addressed at all
- When in doubt between YES and PARTIAL, prefer YES if the essential meaning was conveyed
- Transcription errors are common - be forgiving of minor word variations (e.g., "click" vs "clicked", "reset" vs "resetting")

IMPORTANT:
- Focus on MEANING and INTENT, not exact word matching
- The rubric keywords are guidelines, not strict requirements
- A step is met if the speaker communicated the same concept, regardless of exact wording
- Return ONLY valid JSON in the specified format`;

const VISUAL_ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant that analyzes screen recording frames to identify UI elements and user actions.

Your task is to examine video frames and determine if specific visual requirements were met.

You will be given:
1. A set of video frames (screenshots) with timestamps
2. A list of expected UI elements and actions to look for

For each frame, identify:
1. What screen/page is shown
2. What UI elements are visible (buttons, forms, menus, etc.)
3. What actions appear to be happening (clicks, typing, navigation)
4. Whether the expected elements/actions are present

SCORING GUIDELINES - BE GENEROUS:
- Mark elements as "found" if they appear anywhere in the recording, even if in a different frame than expected
- Accept similar or equivalent UI elements (e.g., "Submit button" matches "Save button" or "OK button")
- Consider the overall flow - if the user accomplished the visual goal, mark it as matched
- Actions should be inferred from state changes between frames when direct observation isn't possible
- Be forgiving of UI variations (different themes, layouts, or styling)
- When in doubt, give credit if the essential visual requirement was demonstrated

IMPORTANT:
- Focus on whether the INTENT of the visual requirement was met
- The expected elements/actions are guidelines, not exact specifications
- Different applications may have different UI patterns for the same functionality
- Return ONLY valid JSON in the specified format`;

const RUBRIC_GENERATION_SYSTEM_PROMPT = `You are an expert instructional designer and evaluation specialist. Your task is to analyze a sample video recording and create:
1. A structured evaluation rubric for assessing similar recordings
2. Clear task requirements/instructions to give contributors

You will be provided with:
1. A transcript of what was said in the video
2. Key frames showing what was shown on screen
3. The type of task being demonstrated
4. Optional additional context about the evaluation goals

Your job is to:
1. Identify the key steps or actions demonstrated in the video
2. Extract what was said at each step (speech criteria)
3. Identify what was shown on screen (visual criteria)
4. Create a structured rubric with clear evaluation criteria
5. Write clear, friendly instructions for contributors explaining what they need to do

RUBRIC GUIDELINES:
- Focus on observable, measurable criteria
- Each step should be specific but FLEXIBLE - focus on the concept/goal, not exact wording
- Include both what was said (speech) and what was shown (visual) when relevant
- Order steps chronologically as they appear in the video
- Assign appropriate weights based on importance
- Mark critical steps as required
- Be thorough but not overly granular (aim for 3-10 steps)
- Remember: Contributors will express ideas in their own words - criteria should match INTENT, not exact phrasing

TASK REQUIREMENTS GUIDELINES:
- Write a clear, descriptive title
- Provide a brief 1-2 sentence description/summary
- List specific requirements as bullet points (what they MUST do)
- Include helpful tips (suggestions for best results)
- Estimate how long the task should take

EVIDENCE TYPES:
- "speech": Step can be verified by transcript analysis
- "visual": Step can be verified by screen content
- "both": Step requires both speech and visual verification

CRITICAL RULES FOR EVIDENCE TYPES:
- If a step involves the presenter SAYING, EXPLAINING, or DESCRIBING something verbally, evidenceType MUST be "speech" or "both"
- Only use "visual" for steps that are PURELY about what's shown on screen with NO verbal component
- When a step has both verbal explanation AND visual demonstration, use "both"
- When in doubt, prefer "both" to ensure comprehensive evaluation
- NEVER set all steps to "visual" if there is transcript content - analyze what was said!

SPEECH CRITERIA REQUIREMENTS - BE FLEXIBLE:
- requiredKeywords: Use CONCEPTUAL keywords that capture the core ideas (e.g., ["password", "reset", "email", "account"])
  - Include common synonyms and related terms (e.g., for "click" also consider "select", "press", "tap")
  - Focus on 2-4 key concept words per step, not exhaustive lists
- requiredPhrases: Use SEMANTIC descriptions of what should be communicated, not exact quotes
  - Good: ["explain password reset process", "mention email verification"]
  - Bad: ["click the reset button exactly as shown"]
  - The phrase should describe the CONCEPT, not the exact words
- Think about what a reasonable person would say to accomplish the same goal - there are many valid ways to express the same idea
- The goal is to verify the CONCEPT was communicated, not that specific words were used

Return ONLY valid JSON in the specified format.`;

export async function up(knex: Knex): Promise<void> {
  // Create ai_prompts table
  console.log('  Creating ai_prompts table...');
  await knex.raw(`
    CREATE TABLE ai_prompts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt_key VARCHAR(100) UNIQUE NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      description TEXT,
      system_prompt TEXT NOT NULL,
      default_prompt TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create ai_prompt_history table
  console.log('  Creating ai_prompt_history table...');
  await knex.raw(`
    CREATE TABLE ai_prompt_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt_id UUID NOT NULL REFERENCES ai_prompts(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      system_prompt TEXT NOT NULL,
      changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      change_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create index for faster history lookups
  await knex.raw(`
    CREATE INDEX idx_ai_prompt_history_prompt_id_version
    ON ai_prompt_history(prompt_id, version DESC)
  `);

  // Seed with current hardcoded prompts
  console.log('  Seeding ai_prompts with current hardcoded prompts...');

  await knex('ai_prompts').insert([
    {
      prompt_key: 'speech_analysis',
      display_name: 'Speech Analysis',
      description: 'Evaluates video recording transcripts against rubric criteria. Used by the AI to analyze what was said in recordings and score against speech-based rubric steps.',
      system_prompt: SPEECH_ANALYSIS_SYSTEM_PROMPT,
      default_prompt: SPEECH_ANALYSIS_SYSTEM_PROMPT,
      version: 1,
      is_active: true,
    },
    {
      prompt_key: 'visual_analysis',
      display_name: 'Visual Analysis',
      description: 'Analyzes screen recording frames to identify UI elements and user actions. Used by the AI to verify visual requirements in rubric steps.',
      system_prompt: VISUAL_ANALYSIS_SYSTEM_PROMPT,
      default_prompt: VISUAL_ANALYSIS_SYSTEM_PROMPT,
      version: 1,
      is_active: true,
    },
    {
      prompt_key: 'rubric_generation',
      display_name: 'Rubric Generation',
      description: 'Generates evaluation rubrics from sample video recordings. Used when creating task templates from example videos.',
      system_prompt: RUBRIC_GENERATION_SYSTEM_PROMPT,
      default_prompt: RUBRIC_GENERATION_SYSTEM_PROMPT,
      version: 1,
      is_active: true,
    },
  ]);

  console.log('  AI prompts tables created and seeded successfully.');
}

export async function down(knex: Knex): Promise<void> {
  console.log('  Dropping ai_prompt_history table...');
  await knex.raw('DROP TABLE IF EXISTS ai_prompt_history CASCADE');

  console.log('  Dropping ai_prompts table...');
  await knex.raw('DROP TABLE IF EXISTS ai_prompts CASCADE');

  console.log('  AI prompts tables dropped successfully.');
}
