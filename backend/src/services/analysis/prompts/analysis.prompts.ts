/**
 * AI Analysis Prompt Templates
 *
 * Structured prompts for Gemini to analyze recordings against rubrics.
 * Uses JSON mode for consistent, parseable responses.
 */

import { RubricStep } from '../../../queues/types/job-types';

// =============================================================================
// Speech Analysis Prompts
// =============================================================================

/**
 * System prompt for speech/transcript analysis
 */
export const SPEECH_ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant that evaluates video recording transcripts against rubric criteria.

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

/**
 * Build speech analysis prompt for a set of rubric steps
 */
export function buildSpeechAnalysisPrompt(
  transcriptText: string,
  transcriptSegments: Array<{ text: string; startTime: number; endTime: number }>,
  rubricSteps: RubricStep[]
): string {
  const stepsWithSpeechCriteria = rubricSteps.filter(
    s => s.evidenceType === 'speech' || s.evidenceType === 'both'
  );

  const stepsJson = stepsWithSpeechCriteria.map(step => ({
    stepId: step.id,
    stepTitle: step.title,
    description: step.description,
    requiredKeywords: step.speechCriteria?.requiredKeywords || [],
    requiredPhrases: step.speechCriteria?.requiredPhrases || [],
    weight: step.weight,
    isRequired: step.isRequired,
  }));

  // Get actual step IDs for the example
  const exampleStepId = stepsWithSpeechCriteria[0]?.id || 'step-1';

  return `## Transcript to Analyze

${transcriptText}

## Transcript Segments (with timestamps)

${transcriptSegments.map((seg) =>
  `[${seg.startTime.toFixed(1)}s - ${seg.endTime.toFixed(1)}s]: ${seg.text}`
).join('\n')}

## Rubric Steps to Evaluate

${JSON.stringify(stepsJson, null, 2)}

## Instructions

Analyze the transcript for each rubric step. For each step in the "Rubric Steps to Evaluate" list above, create a result entry using the EXACT stepId from that step.

IMPORTANT: Use the stepId values EXACTLY as they appear in the rubric steps above (e.g., "${exampleStepId}"). Do NOT generate your own IDs.

Return a JSON object with this exact structure:

\`\`\`json
{
  "stepResults": [
    {
      "stepId": "${exampleStepId}",
      "score": "YES" | "PARTIAL" | "NO",
      "confidence": 0.0-1.0,
      "keywordsFound": ["keyword1", "keyword2"],
      "keywordsMissing": ["keyword3"],
      "relevantExcerpts": [
        {
          "text": "excerpt from transcript",
          "startTime": 0.0,
          "endTime": 5.0
        }
      ],
      "reasoning": "Brief explanation of the score"
    }
  ],
  "overallObservations": "General notes about the transcript quality and content"
}
\`\`\`

Return ONLY the JSON object, no additional text.`;
}

// =============================================================================
// Visual Analysis Prompts
// =============================================================================

/**
 * System prompt for visual/frame analysis
 */
export const VISUAL_ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant that analyzes screen recording frames to identify UI elements and user actions.

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

/**
 * Build visual analysis prompt for a batch of frames
 */
export function buildVisualAnalysisPrompt(
  frames: Array<{ index: number; timestampSeconds: number }>,
  rubricSteps: RubricStep[]
): string {
  const stepsWithVisualCriteria = rubricSteps.filter(
    s => s.evidenceType === 'visual' || s.evidenceType === 'both'
  );

  const expectedElements = stepsWithVisualCriteria.flatMap(
    s => s.visualCriteria?.expectedElements || []
  );
  const expectedActions = stepsWithVisualCriteria.flatMap(
    s => s.visualCriteria?.expectedActions || []
  );

  // Get actual step IDs for the example
  const exampleStepId = stepsWithVisualCriteria[0]?.id || 'step-1';

  // Build step info with IDs clearly shown
  const stepsInfo = stepsWithVisualCriteria.map(step => `
### Step ID: "${step.id}" - ${step.title}
- Elements: ${step.visualCriteria?.expectedElements?.join(', ') || 'None'}
- Actions: ${step.visualCriteria?.expectedActions?.join(', ') || 'None'}
`).join('\n');

  return `## Frames to Analyze

You are viewing ${frames.length} frames from a screen recording.
Frames are shown at these timestamps: ${frames.map(f => `${f.timestampSeconds.toFixed(1)}s`).join(', ')}

## Expected Elements to Look For

${expectedElements.length > 0 ? expectedElements.map(e => `- ${e}`).join('\n') : 'No specific elements specified'}

## Expected Actions to Look For

${expectedActions.length > 0 ? expectedActions.map(a => `- ${a}`).join('\n') : 'No specific actions specified'}

## Rubric Steps (use these EXACT step IDs in your response)

${stepsInfo}

## Instructions

Analyze each frame and identify what you see. For the "stepMatches" array, use the EXACT stepId values from the rubric steps above (e.g., "${exampleStepId}"). Do NOT generate your own IDs.

Return a JSON object with this exact structure:

\`\`\`json
{
  "frameAnalysis": [
    {
      "frameIndex": 0,
      "timestamp": 0.0,
      "screenType": "dashboard" | "settings" | "form" | "modal" | "other",
      "elementsDetected": [
        {
          "element": "element description",
          "confidence": 0.0-1.0
        }
      ],
      "actionsDetected": [
        {
          "action": "action description",
          "confidence": 0.0-1.0
        }
      ],
      "notes": "Any additional observations"
    }
  ],
  "stepMatches": [
    {
      "stepId": "${exampleStepId}",
      "matched": true | false,
      "matchedAt": 0.0,
      "elementsFound": ["element1"],
      "elementsMissing": ["element2"],
      "actionsFound": ["action1"],
      "actionsMissing": ["action2"],
      "confidence": 0.0-1.0,
      "observation": "Brief description of what was visually witnessed (e.g., 'User clicked the Submit button and a confirmation dialog appeared showing the order total')"
    }
  ]
}
\`\`\`

Return ONLY the JSON object, no additional text.`;
}

// =============================================================================
// Step Verification Prompts
// =============================================================================

/**
 * Build a prompt to verify a single step with combined evidence
 */
export function buildStepVerificationPrompt(
  step: RubricStep,
  speechEvidence: {
    keywordsFound: string[];
    keywordsMissing: string[];
    excerpts: Array<{ text: string; startTime: number; endTime: number }>;
  },
  visualEvidence: {
    elementsFound: string[];
    elementsMissing: string[];
    actionsFound: string[];
    actionsMissing: string[];
    frameTimestamps: number[];
  }
): string {
  return `## Rubric Step to Verify

**Title:** ${step.title}
**Description:** ${step.description}
**Evidence Type Required:** ${step.evidenceType}
**Weight:** ${step.weight}/10
**Required:** ${step.isRequired ? 'Yes' : 'No'}

### Speech Criteria
- Required Keywords: ${step.speechCriteria?.requiredKeywords?.join(', ') || 'None'}
- Required Phrases: ${step.speechCriteria?.requiredPhrases?.join(', ') || 'None'}

### Visual Criteria
- Expected Elements: ${step.visualCriteria?.expectedElements?.join(', ') || 'None'}
- Expected Actions: ${step.visualCriteria?.expectedActions?.join(', ') || 'None'}

## Evidence Found

### Speech Evidence
- Keywords Found: ${speechEvidence.keywordsFound.join(', ') || 'None'}
- Keywords Missing: ${speechEvidence.keywordsMissing.join(', ') || 'None'}
- Relevant Excerpts:
${speechEvidence.excerpts.map(e => `  - [${e.startTime.toFixed(1)}s]: "${e.text}"`).join('\n') || '  None'}

### Visual Evidence
- Elements Found: ${visualEvidence.elementsFound.join(', ') || 'None'}
- Elements Missing: ${visualEvidence.elementsMissing.join(', ') || 'None'}
- Actions Found: ${visualEvidence.actionsFound.join(', ') || 'None'}
- Actions Missing: ${visualEvidence.actionsMissing.join(', ') || 'None'}
- Detected at timestamps: ${visualEvidence.frameTimestamps.map(t => `${t.toFixed(1)}s`).join(', ') || 'None'}

## Instructions

Based on the evidence above, provide a final assessment of whether this step was completed.

Return a JSON object with this exact structure:

\`\`\`json
{
  "score": "YES" | "PARTIAL" | "NO",
  "confidence": 0.0-1.0,
  "reasoning": "Detailed explanation of why this score was assigned",
  "suggestions": "What could be done to fully complete this step (if not YES)"
}
\`\`\`

Return ONLY the JSON object, no additional text.`;
}

// =============================================================================
// Summary Generation Prompts
// =============================================================================

/**
 * Build prompt for generating analysis summary
 */
export function buildSummaryPrompt(
  stepResults: Array<{
    stepTitle: string;
    score: 'YES' | 'PARTIAL' | 'NO';
    reasoning: string;
  }>,
  overallScore: number,
  verdict: string
): string {
  return `## Analysis Results to Summarize

**Overall Score:** ${overallScore.toFixed(1)}%
**Verdict:** ${verdict}

### Step Results

${stepResults.map((r, i) => `
${i + 1}. **${r.stepTitle}**
   - Score: ${r.score}
   - Reasoning: ${r.reasoning}
`).join('\n')}

## Instructions

Generate a helpful summary of this analysis. Include:
1. A brief overall assessment
2. Key strengths (what was done well)
3. Areas for improvement (what was missed or could be better)
4. Specific coaching suggestions

Return a JSON object with this exact structure:

\`\`\`json
{
  "summaryText": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "coachingSuggestions": [
    {
      "stepId": "step-id or null for general",
      "priority": "high" | "medium" | "low",
      "title": "Short title",
      "description": "Detailed suggestion"
    }
  ]
}
\`\`\`

Return ONLY the JSON object, no additional text.`;
}
