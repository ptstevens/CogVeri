import { Knex } from 'knex';

/**
 * Migration: Add Analysis Test Template
 *
 * A simple template designed to test and validate the AI analysis system.
 * Uses clear, verifiable criteria that are easy to demonstrate.
 *
 * Test scenario: "Google Search Demo"
 * - Open Google
 * - Search for a term
 * - View results
 */
export async function up(knex: Knex): Promise<void> {
  // Helper to generate step IDs
  const stepId = (prefix: string, num: number) => `${prefix}-step-${num}`;

  await knex('task_templates').insert({
    title: 'Analysis Test - Google Search',
    description: `A simple test template to validate the AI analysis system works correctly.

**Purpose:**
This template is designed for testing CogVeri's AI video analysis capabilities with clear, easily verifiable criteria.

**Test Instructions:**
1. Start recording
2. Open Google in your browser
3. Say "I'm going to search Google for CogVeri"
4. Type "CogVeri" in the search box
5. Press Enter and show the results
6. Say "Here are the search results"
7. Stop recording

**Expected Analysis Results:**
- Speech: Should detect your verbal statements
- Visual: Should detect Google logo, search box, and results`,
    category: 'Testing & QA',
    icon_emoji: '🧪',
    organization_id: null,
    type: 'recording',
    instructions: `# Analysis Test Recording

## Purpose
This is a simple test to verify the AI analysis system is working correctly.

---

## Recording Steps

### Step 1: Open Google (10 seconds)
- Open your browser
- Navigate to google.com
- **Say out loud:** "I'm opening Google to demonstrate the search"
- Wait for the page to fully load

### Step 2: Perform Search (15 seconds)
- Click in the search box
- **Say out loud:** "Now I'm going to search for CogVeri"
- Type: \`CogVeri\`
- Press Enter

### Step 3: Show Results (10 seconds)
- Wait for results to load
- **Say out loud:** "Here are the search results for CogVeri"
- Scroll slightly to show results are present
- **Say out loud:** "The search is complete"

---

## What the AI Will Look For

| Step | Speech Detection | Visual Detection |
|------|------------------|------------------|
| 1 | "Google", "opening", "search" | Google logo, search box |
| 2 | "search", "CogVeri", "typing" | Text in search box |
| 3 | "results", "complete" | Search results page |

---

## Tips for Best Results
- Speak clearly and at normal pace
- Pause briefly between actions
- Keep the browser in focus
- Make sure UI elements are visible`,
    min_duration_seconds: 30,
    max_duration_seconds: 120,
    priority: 'medium',
    tags: knex.raw("ARRAY['test', 'analysis', 'demo', 'google', 'search']"),
    is_active: true,
    is_system_default: true,
    evaluation_criteria: JSON.stringify({
      version: '1.0',
      passingScore: 60,
      scoringMethod: 'weighted',
      autoAnalyze: true,
      rubricSteps: [
        {
          id: stepId('test', 1),
          order: 1,
          title: 'Open Google',
          description: 'Open Google.com and verbally announce what you are doing.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['google', 'open', 'search'],
            requiredPhrases: [],
            optionalKeywords: ['browser', 'website', 'navigate', 'going'],
            matchThreshold: 0.5,
          },
          visualCriteria: {
            expectedElements: ['Google logo', 'search box', 'search button'],
            expectedActions: ['page loading', 'browser navigation'],
          },
          weight: 10,
          isRequired: true,
        },
        {
          id: stepId('test', 2),
          order: 2,
          title: 'Type Search Query',
          description: 'Type a search term in the Google search box while explaining what you are doing.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['search', 'type', 'cogveri'],
            requiredPhrases: [],
            optionalKeywords: ['typing', 'entering', 'query', 'looking'],
            matchThreshold: 0.5,
          },
          visualCriteria: {
            expectedElements: ['search box', 'typed text', 'cursor'],
            expectedActions: ['typing', 'text input', 'keyboard entry'],
          },
          weight: 10,
          isRequired: true,
        },
        {
          id: stepId('test', 3),
          order: 3,
          title: 'Show Search Results',
          description: 'Display the search results page and confirm the search was successful.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['results', 'search', 'complete', 'done'],
            requiredPhrases: [],
            optionalKeywords: ['here', 'showing', 'found', 'see'],
            matchThreshold: 0.5,
          },
          visualCriteria: {
            expectedElements: ['search results', 'result links', 'page titles'],
            expectedActions: ['results displayed', 'page loaded'],
          },
          weight: 10,
          isRequired: true,
        },
      ],
    }),
    created_at: new Date(),
    updated_at: new Date(),
  });

  console.log('Added Analysis Test - Google Search template');
}

export async function down(knex: Knex): Promise<void> {
  await knex('task_templates')
    .where('title', 'Analysis Test - Google Search')
    .where('is_system_default', true)
    .del();

  console.log('Removed Analysis Test template');
}
