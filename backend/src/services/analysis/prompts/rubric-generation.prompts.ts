/**
 * Rubric Generation Prompts
 *
 * AI prompts for generating evaluation rubrics from sample videos.
 * Uses Gemini to analyze video content and suggest rubric steps.
 */

/**
 * System prompt for rubric generation from sample video
 */
export const RUBRIC_GENERATION_SYSTEM_PROMPT = `You are an expert instructional designer and evaluation specialist. Your task is to analyze a sample video recording and create:
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

/**
 * Build the user prompt for rubric generation
 */
export function buildRubricGenerationPrompt(params: {
  transcriptText: string;
  transcriptSegments: Array<{ text: string; startTime: number; endTime: number }>;
  frameDescriptions: Array<{ timestampSeconds: number; description: string }>;
  taskType: string;
  customContext?: string;
}): string {
  const { transcriptText, transcriptSegments, frameDescriptions, taskType, customContext } = params;

  const hasTranscript = transcriptText && transcriptText.trim().length > 0;

  const segmentsSection = transcriptSegments.length > 0
    ? transcriptSegments.map(seg =>
        `[${seg.startTime.toFixed(1)}s - ${seg.endTime.toFixed(1)}s]: ${seg.text}`
      ).join('\n')
    : 'No transcript segments available';

  const framesSection = frameDescriptions.length > 0
    ? frameDescriptions.map(frame =>
        `[${frame.timestampSeconds.toFixed(1)}s]: ${frame.description}`
      ).join('\n')
    : 'No frame descriptions available';

  const transcriptEmphasis = hasTranscript
    ? `\n\n⚠️ IMPORTANT: This video HAS a transcript with spoken content. You MUST:
- Analyze what the presenter SAYS at each step
- Use evidenceType "speech" or "both" for steps where the presenter explains something verbally
- Extract actual keywords and phrases from the transcript below for speechCriteria
- DO NOT set all steps to "visual" - use speech evidence for verbal explanations!`
    : '';

  return `## Task Type
${taskType}

${customContext ? `## Additional Context\n${customContext}\n` : ''}
## Full Transcript
${transcriptText || 'No transcript available'}${transcriptEmphasis}

## Transcript Segments (with timestamps)
${segmentsSection}

## Key Frame Descriptions (with timestamps)
${framesSection}

## Instructions

Based on the video content above, generate a comprehensive evaluation rubric AND task requirements. Return a JSON object with this exact structure:

\`\`\`json
{
  "suggestedTitle": "A descriptive title for tasks using this rubric",
  "rubricSteps": [
    {
      "id": "step-1",
      "order": 1,
      "title": "Clear, concise step title",
      "description": "Detailed description of what should happen in this step",
      "evidenceType": "speech" | "visual" | "both",
      "speechCriteria": {
        "requiredKeywords": ["keyword1", "keyword2"],
        "requiredPhrases": ["exact phrase to look for"],
        "optionalKeywords": ["optional keywords for partial credit"]
      },
      "visualCriteria": {
        "expectedElements": ["UI element or screen state to verify"],
        "expectedActions": ["user action to observe"]
      },
      "weight": 1-10,
      "isRequired": true | false
    }
  ],
  "taskRequirements": {
    "title": "Clear, actionable task title",
    "description": "Brief 1-2 sentence summary of what the contributor needs to do",
    "requirements": [
      "First specific thing they must do",
      "Second specific thing they must do",
      "Third specific thing they must show/explain"
    ],
    "tips": [
      "Helpful suggestion for better results",
      "Another tip for quality recording"
    ],
    "estimatedDuration": "2-3 minutes"
  },
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of the rubric structure and why these steps were chosen"
}
\`\`\`

IMPORTANT FOR RUBRIC:
- Generate unique IDs for each step (step-1, step-2, etc.)
- Order steps chronologically
- Include speechCriteria only for steps with evidenceType "speech" or "both"
- Include visualCriteria only for steps with evidenceType "visual" or "both"
- Set weight between 1 (minor) and 10 (critical)
- Mark steps as isRequired: true if they are essential for task completion
- confidence should reflect how well you could understand the video content

CRITICAL FOR EVIDENCE TYPES:
- If the presenter SPEAKS or EXPLAINS something, use "speech" or "both"
- Extract REAL keywords/phrases from the transcript for speechCriteria
- Only use "visual" alone for purely visual steps with no verbal component
- Prefer "both" when a step has verbal explanation AND visual demonstration

IMPORTANT FOR TASK REQUIREMENTS:
- title should be clear and action-oriented (e.g., "Demonstrate How to Reset Password")
- description is a brief summary shown in task lists
- requirements are must-do items (3-6 bullet points)
- tips are suggestions for quality (2-4 bullet points)
- estimatedDuration should be realistic (e.g., "2-3 minutes", "5-10 minutes")

Return ONLY the JSON object, no additional text.`;
}

/**
 * Build prompt for analyzing a single frame
 * Used when extracting frame descriptions for rubric generation
 */
export function buildFrameDescriptionPrompt(frameIndex: number, totalFrames: number): string {
  return `Describe this screen recording frame concisely. Focus on:
1. What screen or page is shown
2. Key UI elements visible (buttons, forms, text fields, etc.)
3. Any user actions apparent (cursor position, highlighted elements)
4. Any text or data displayed

Frame ${frameIndex + 1} of ${totalFrames}.

Provide a 1-2 sentence description.`;
}

/**
 * Build prompt for batch frame analysis
 * More efficient when analyzing multiple frames together
 */
export function buildBatchFrameDescriptionPrompt(frameCount: number): string {
  return `You are viewing ${frameCount} frames from a screen recording. For each frame, provide a brief description focusing on:
1. What screen or page is shown
2. Key UI elements and their state
3. Any visible user actions or interactions
4. Important text or data displayed

Return a JSON array with descriptions for each frame:

\`\`\`json
{
  "frameDescriptions": [
    {
      "frameIndex": 0,
      "description": "Brief description of frame 0"
    },
    {
      "frameIndex": 1,
      "description": "Brief description of frame 1"
    }
  ]
}
\`\`\`

Return ONLY the JSON object, no additional text.`;
}
