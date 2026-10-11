import { Knex } from 'knex';

/**
 * Seed: Initialize system default task templates
 * These templates are copied to organizations during onboarding
 *
 * 4 Core Templates:
 * 1. Software Demo - Showcase product features professionally
 * 2. Process Documentation - Capture step-by-step workflows
 * 3. Training Video - Teach skills and onboard team members
 * 4. Bug Report - Document issues for development teams
 */
export async function seed(knex: Knex): Promise<void> {
  // PRODUCTION SAFEGUARD: Prevent accidental data modification
  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowProdSeed = process.env.ALLOW_PRODUCTION_SEED === 'true';

  if (nodeEnv === 'production' && !allowProdSeed) {
    console.warn('⚠️  Seed aborted: Running seeds in production is disabled.');
    console.warn('   Set ALLOW_PRODUCTION_SEED=true to override (dangerous!)');
    return;
  }

  if (nodeEnv === 'production' && allowProdSeed) {
    console.warn('⚠️  WARNING: Running seed in production mode!');
  }

  // Get the search_path from environment
  const searchPath = process.env.DB_SEARCH_PATH || 'public';

  // Set the search path for this connection
  await knex.raw(`SET search_path = '${searchPath}'`);

  // Delete existing system default templates (we're replacing them)
  await knex('task_templates').where('is_system_default', true).del();

  // System user ID for created_by field
  const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

  // Helper to generate UUID-like IDs for rubric steps
  const stepId = (prefix: string, num: number) => `${prefix}-step-${num}`;

  // =============================================================================
  // TEMPLATE 1: Software Demo Recording
  // =============================================================================
  const softwareDemoTemplate = {
    title: 'Software Demo Recording',
    description: `Create a professional product demonstration that showcases features and drives understanding.

**Perfect for:**
- Product launches and feature announcements
- Sales enablement and prospect demos
- Customer success training materials
- Internal knowledge sharing

**What makes a great demo:**
- Clear problem → solution narrative
- Real-world use cases and examples
- Visible UI interactions with explanations
- Confident, measured pacing`,
    category: 'Product & Sales',
    icon_emoji: '🚀',
    organization_id: null,
    type: 'recording',
    instructions: `# Software Demo Recording Guide

## Before You Start
- [ ] Close unnecessary applications and browser tabs
- [ ] Clear your desktop of personal files
- [ ] Prepare sample data that tells a compelling story
- [ ] Test your microphone and screen recording
- [ ] Have your demo flow written down nearby

---

## Recording Structure

### 1. Opening Hook (30 seconds)
Start with the **problem** your feature solves:
> "Have you ever spent hours manually doing X? Today I'll show you how [Feature] eliminates this pain."

### 2. Quick Context (30 seconds)
- Who is this for?
- What will they learn?
- What's the end result?

### 3. Feature Walkthrough (3-5 minutes)
Walk through the feature step-by-step:
1. **Show the starting point** - Where does the user begin?
2. **Demonstrate each action** - Click deliberately, pause after key steps
3. **Highlight the result** - Show the outcome clearly
4. **Connect to value** - "This saves you X hours per week"

### 4. Pro Tips (Optional, 1 minute)
Share 2-3 insider tips:
- Keyboard shortcuts
- Advanced options
- Common use cases

### 5. Wrap-Up (30 seconds)
- Summarize what was covered
- Point to next steps or related features
- Clear call to action

---

## Best Practices

| Do | Don't |
|---|---|
| Speak at a measured pace | Rush through steps |
| Pause after important actions | Fill silence with "um" |
| Use real, relatable data | Use "test123" sample data |
| Highlight cursor on key clicks | Assume viewers can follow fast movements |
| Explain the "why" | Only show the "what" |`,
    min_duration_seconds: 120,
    max_duration_seconds: 600,
    priority: 'high',
    tags: ['demo', 'product', 'sales', 'features', 'walkthrough'],
    is_active: true,
    is_system_default: true,
    created_by: SYSTEM_USER_ID,
    evaluation_criteria: {
      version: '1.0',
      passingScore: 70,
      scoringMethod: 'weighted',
      autoAnalyze: true,
      rubricSteps: [
        {
          id: stepId('demo', 1),
          order: 1,
          title: 'Opening Hook & Problem Statement',
          description:
            'Recording opens with a clear problem statement or hook that captures attention and sets context for the demo.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['problem', 'challenge', 'solution', 'show', 'demonstrate'],
            requiredPhrases: [],
            optionalKeywords: ['today', 'learn', 'discover', 'feature'],
            matchThreshold: 0.6,
          },
          weight: 8,
          isRequired: true,
        },
        {
          id: stepId('demo', 2),
          order: 2,
          title: 'Feature Introduction',
          description:
            'The presenter clearly introduces what feature or capability will be demonstrated and who it benefits.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['feature', 'capability', 'tool', 'function'],
            requiredPhrases: [],
            optionalKeywords: ['benefit', 'help', 'enable', 'allows'],
            matchThreshold: 0.5,
          },
          weight: 6,
          isRequired: true,
        },
        {
          id: stepId('demo', 3),
          order: 3,
          title: 'Step-by-Step Demonstration',
          description:
            'The feature is demonstrated with clear, sequential steps. Each action is visible and explained.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['click', 'select', 'step', 'next', 'now'],
            requiredPhrases: [],
            optionalKeywords: ['first', 'then', 'after', 'notice'],
            matchThreshold: 0.6,
          },
          visualCriteria: {
            expectedElements: ['cursor movement', 'button clicks', 'form inputs', 'navigation'],
            expectedActions: ['clicking', 'typing', 'scrolling', 'selecting'],
          },
          weight: 10,
          isRequired: true,
        },
        {
          id: stepId('demo', 4),
          order: 4,
          title: 'Value Explanation',
          description:
            'The presenter explains the benefit or value of what was demonstrated - connecting features to outcomes.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['benefit', 'value', 'save', 'improve', 'result'],
            requiredPhrases: [],
            optionalKeywords: ['time', 'money', 'effort', 'easier', 'faster', 'better'],
            matchThreshold: 0.5,
          },
          weight: 8,
          isRequired: true,
        },
        {
          id: stepId('demo', 5),
          order: 5,
          title: 'Clear Conclusion',
          description: 'Recording ends with a summary and clear next steps or call to action.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['summary', 'covered', 'learned', 'next', 'try', 'start'],
            requiredPhrases: [],
            optionalKeywords: ['questions', 'help', 'resources', 'thank'],
            matchThreshold: 0.5,
          },
          weight: 6,
          isRequired: false,
        },
        {
          id: stepId('demo', 6),
          order: 6,
          title: 'Professional Audio Quality',
          description:
            'Audio is clear, well-paced, and free from distracting background noise or excessive filler words.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: [],
            requiredPhrases: [],
            optionalKeywords: [],
            matchThreshold: 0,
          },
          weight: 5,
          isRequired: false,
        },
      ],
    },
  };

  // =============================================================================
  // TEMPLATE 2: Process Documentation
  // =============================================================================
  const processDocTemplate = {
    title: 'Process Documentation',
    description: `Capture and document business processes, workflows, and standard operating procedures with clear, followable recordings.

**Perfect for:**
- Standard Operating Procedures (SOPs)
- Workflow documentation
- Compliance and audit trails
- Knowledge transfer during role transitions
- Training material creation

**Key elements:**
- Numbered, sequential steps
- Clear prerequisites and outcomes
- Common pitfalls and troubleshooting
- Verification checkpoints`,
    category: 'Operations & Training',
    icon_emoji: '📋',
    organization_id: null,
    type: 'recording',
    instructions: `# Process Documentation Guide

## Purpose
Create a clear, reusable recording that anyone can follow to complete this process correctly.

---

## Pre-Recording Checklist
- [ ] Write out all steps before recording
- [ ] Identify prerequisites (what's needed before starting)
- [ ] Note common mistakes to warn about
- [ ] Define success criteria (how do you know it worked?)

---

## Recording Structure

### 1. Process Overview (1 minute)
Provide context before diving in:
- **What** is this process?
- **When** is it used?
- **Who** typically performs it?
- **How long** does it usually take?

### 2. Prerequisites (30 seconds - 1 minute)
List what's needed before starting:
> "Before we begin, make sure you have:
> - Access to [System X]
> - The [Document Y] ready
> - Approval from [Person Z]"

### 3. Step-by-Step Walkthrough (Main content)
For each step:
1. **Announce the step number**: "Step 1..."
2. **Describe what you're doing**: "I'm clicking on..."
3. **Show the action**: Perform it on screen
4. **Confirm the result**: "You should now see..."

**Between major steps**, pause briefly to let viewers catch up.

### 4. Common Issues & Solutions (1-2 minutes)
Address what can go wrong:
> "If you see this error, it usually means... The fix is..."

### 5. Verification & Wrap-Up (30 seconds)
- Show the final result
- Explain how to verify success
- Mention where to get help

---

## Documentation Standards

| Element | Example |
|---------|---------|
| Step numbering | "Step 1 of 8", "Step 2 of 8"... |
| Time estimates | "This step takes about 2 minutes" |
| Decision points | "If you see X, do Y. If you see Z, do W" |
| Verification | "You'll know it worked when you see..." |`,
    min_duration_seconds: 180,
    max_duration_seconds: 1800,
    priority: 'medium',
    tags: ['process', 'documentation', 'sop', 'workflow', 'training'],
    is_active: true,
    is_system_default: true,
    created_by: SYSTEM_USER_ID,
    evaluation_criteria: {
      version: '1.0',
      passingScore: 75,
      scoringMethod: 'weighted',
      autoAnalyze: true,
      rubricSteps: [
        {
          id: stepId('process', 1),
          order: 1,
          title: 'Process Introduction',
          description:
            'Recording begins with a clear explanation of what process is being documented, its purpose, and when it applies.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['process', 'procedure', 'workflow', 'how to', 'guide'],
            requiredPhrases: [],
            optionalKeywords: ['purpose', 'when', 'used', 'need'],
            matchThreshold: 0.6,
          },
          weight: 7,
          isRequired: true,
        },
        {
          id: stepId('process', 2),
          order: 2,
          title: 'Prerequisites Stated',
          description:
            'Any requirements, access, or materials needed before starting the process are clearly stated.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['need', 'require', 'before', 'access', 'prerequisite', 'first'],
            requiredPhrases: [],
            optionalKeywords: ['make sure', 'have', 'ready', 'prepared'],
            matchThreshold: 0.5,
          },
          weight: 6,
          isRequired: true,
        },
        {
          id: stepId('process', 3),
          order: 3,
          title: 'Sequential Step Numbering',
          description:
            'Steps are clearly numbered or ordered (Step 1, Step 2, etc.) making it easy to follow along.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['step', 'first', 'second', 'next', 'then'],
            requiredPhrases: [],
            optionalKeywords: ['1', '2', '3', 'one', 'two', 'three', 'finally'],
            matchThreshold: 0.6,
          },
          weight: 9,
          isRequired: true,
        },
        {
          id: stepId('process', 4),
          order: 4,
          title: 'Visual Demonstration',
          description:
            'Each step is visually demonstrated on screen with clear cursor movements and visible actions.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['click', 'select', 'type', 'enter', 'open'],
            requiredPhrases: [],
            optionalKeywords: ['here', 'this', 'button', 'field', 'menu'],
            matchThreshold: 0.5,
          },
          visualCriteria: {
            expectedElements: ['cursor', 'clicks', 'form fields', 'buttons'],
            expectedActions: ['navigation', 'data entry', 'selection', 'submission'],
          },
          weight: 8,
          isRequired: true,
        },
        {
          id: stepId('process', 5),
          order: 5,
          title: 'Verification Points',
          description:
            'Presenter explains how to verify each step was completed correctly (confirmation screens, expected results).',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['verify', 'confirm', 'check', 'should see', 'successful'],
            requiredPhrases: [],
            optionalKeywords: ['correct', 'expected', 'result', 'confirmation'],
            matchThreshold: 0.5,
          },
          weight: 7,
          isRequired: true,
        },
        {
          id: stepId('process', 6),
          order: 6,
          title: 'Troubleshooting / Common Issues',
          description:
            'Common problems, errors, or pitfalls are mentioned with solutions or workarounds.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['if', 'error', 'issue', 'problem', 'wrong', 'fix'],
            requiredPhrases: [],
            optionalKeywords: ['trouble', 'solution', 'instead', 'try', 'common'],
            matchThreshold: 0.4,
          },
          weight: 5,
          isRequired: false,
        },
        {
          id: stepId('process', 7),
          order: 7,
          title: 'Process Completion Confirmation',
          description:
            'Recording ends by showing the completed state and confirming the process was successful.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['complete', 'done', 'finished', 'success', 'completed'],
            requiredPhrases: [],
            optionalKeywords: ['final', 'end', "that's it", 'all set'],
            matchThreshold: 0.5,
          },
          visualCriteria: {
            expectedElements: ['success message', 'confirmation screen', 'completed state'],
            expectedActions: ['final result display'],
          },
          weight: 6,
          isRequired: true,
        },
      ],
    },
  };

  // =============================================================================
  // TEMPLATE 3: Training Video
  // =============================================================================
  const trainingVideoTemplate = {
    title: 'Training Video',
    description: `Create engaging educational content that teaches skills, concepts, or procedures to your team.

**Perfect for:**
- Employee onboarding and orientation
- Skill development and upskilling
- Tool and software training
- Best practices and methodology training
- Compliance and policy education

**Effective training videos:**
- Start with learning objectives
- Use examples and demonstrations
- Include knowledge checks
- End with key takeaways`,
    category: 'Learning & Development',
    icon_emoji: '🎓',
    organization_id: null,
    type: 'recording',
    instructions: `# Training Video Creation Guide

## Learning Design Principles
Before recording, answer these questions:
1. **Who** is the target audience?
2. **What** should they be able to do after watching?
3. **How** will they apply this knowledge?

---

## Video Structure

### 1. Welcome & Learning Objectives (1 minute)
Set expectations clearly:
> "By the end of this video, you'll be able to:
> - [Objective 1]
> - [Objective 2]
> - [Objective 3]"

### 2. Context / Why This Matters (1-2 minutes)
Connect to real-world relevance:
- Why is this skill important?
- What problems does it solve?
- How will learners benefit?

### 3. Core Content (Main body)

**For conceptual training:**
- Explain the concept simply
- Provide examples (2-3)
- Show common mistakes

**For procedural training:**
- Demonstrate step-by-step
- Explain decisions at each point
- Show variations if applicable

**For tool training:**
- Start with the basics
- Build to advanced features
- Show real workflows

### 4. Practice / Application (Optional, 2-3 minutes)
Help learners apply knowledge:
> "Now try this yourself: [Exercise]"
> "Pause the video and attempt..."

### 5. Key Takeaways (1 minute)
Reinforce the main points:
> "Remember these 3 key things:
> 1. [Point 1]
> 2. [Point 2]
> 3. [Point 3]"

### 6. Next Steps (30 seconds)
Guide continued learning:
- Related topics to explore
- Resources for deeper learning
- Who to contact for questions

---

## Training Video Best Practices

### Engagement Techniques
| Technique | Example |
|-----------|---------|
| Questions | "Have you ever wondered why...?" |
| Stories | "Let me tell you about a time when..." |
| Analogies | "Think of it like..." |
| Humor | Light, professional humor (where appropriate) |

### Pacing Guidelines
- **New concepts**: Slow down, repeat key points
- **Familiar material**: Move at normal pace
- **Complex procedures**: Pause between steps
- **Wrap-up**: Deliberate, clear delivery

### Accessibility
- Speak clearly and at moderate pace
- Avoid jargon (or define it when used)
- Use visual cues alongside verbal explanations`,
    min_duration_seconds: 180,
    max_duration_seconds: 1200,
    priority: 'high',
    tags: ['training', 'learning', 'education', 'onboarding', 'skills'],
    is_active: true,
    is_system_default: true,
    created_by: SYSTEM_USER_ID,
    evaluation_criteria: {
      version: '1.0',
      passingScore: 70,
      scoringMethod: 'weighted',
      autoAnalyze: true,
      rubricSteps: [
        {
          id: stepId('training', 1),
          order: 1,
          title: 'Learning Objectives Stated',
          description:
            'The video begins with clear learning objectives - what viewers will know or be able to do after watching.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['learn', 'objective', 'able to', 'understand', 'know how'],
            requiredPhrases: [],
            optionalKeywords: ['goal', 'by the end', 'will', 'today'],
            matchThreshold: 0.5,
          },
          weight: 8,
          isRequired: true,
        },
        {
          id: stepId('training', 2),
          order: 2,
          title: 'Context and Relevance',
          description:
            "Presenter explains why this topic matters and how it connects to the learner's work or goals.",
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['why', 'important', 'matter', 'help', 'benefit'],
            requiredPhrases: [],
            optionalKeywords: ['relevant', 'useful', 'need', 'because'],
            matchThreshold: 0.5,
          },
          weight: 6,
          isRequired: true,
        },
        {
          id: stepId('training', 3),
          order: 3,
          title: 'Clear Explanations',
          description:
            'Core concepts or procedures are explained clearly with appropriate detail and examples.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['means', 'example', 'like', 'because', 'when'],
            requiredPhrases: [],
            optionalKeywords: ['for instance', 'such as', 'this is', 'basically'],
            matchThreshold: 0.5,
          },
          weight: 9,
          isRequired: true,
        },
        {
          id: stepId('training', 4),
          order: 4,
          title: 'Visual Demonstrations',
          description:
            'Where applicable, concepts are demonstrated visually with screen sharing or visual aids.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['see', 'look', 'show', 'here', 'watch'],
            requiredPhrases: [],
            optionalKeywords: ['notice', 'screen', 'visual', 'display'],
            matchThreshold: 0.4,
          },
          visualCriteria: {
            expectedElements: ['screen content', 'diagrams', 'examples'],
            expectedActions: ['pointing', 'highlighting', 'demonstrating'],
          },
          weight: 7,
          isRequired: false,
        },
        {
          id: stepId('training', 5),
          order: 5,
          title: 'Examples Provided',
          description:
            'At least one concrete example is given to illustrate the concepts being taught.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['example', 'instance', 'case', 'scenario', 'imagine'],
            requiredPhrases: [],
            optionalKeywords: ['suppose', "let's say", 'consider', 'such as'],
            matchThreshold: 0.5,
          },
          weight: 7,
          isRequired: true,
        },
        {
          id: stepId('training', 6),
          order: 6,
          title: 'Key Takeaways / Summary',
          description:
            'The training ends with a clear summary of key points or takeaways that reinforce learning.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['remember', 'key', 'takeaway', 'summary', 'important'],
            requiredPhrases: [],
            optionalKeywords: ['main points', 'recap', 'conclusion', 'learned'],
            matchThreshold: 0.5,
          },
          weight: 8,
          isRequired: true,
        },
        {
          id: stepId('training', 7),
          order: 7,
          title: 'Next Steps or Resources',
          description:
            'Viewers are directed to next steps, additional resources, or where to get help.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['next', 'resources', 'help', 'questions', 'more'],
            requiredPhrases: [],
            optionalKeywords: ['contact', 'documentation', 'practice', 'continue'],
            matchThreshold: 0.4,
          },
          weight: 5,
          isRequired: false,
        },
      ],
    },
  };

  // =============================================================================
  // TEMPLATE 4: Bug Report Recording
  // =============================================================================
  const bugReportTemplate = {
    title: 'Bug Report Recording',
    description: `Document software bugs and issues with clear, reproducible recordings that help developers fix problems quickly.

**Perfect for:**
- QA testing and bug documentation
- Customer-reported issue reproduction
- Development team issue handoff
- Support ticket attachments
- Regression testing evidence

**Essential bug report elements:**
- Environment information
- Steps to reproduce
- Expected vs. actual behavior
- Error messages and console output`,
    category: 'QA & Support',
    icon_emoji: '🐛',
    organization_id: null,
    type: 'recording',
    instructions: `# Bug Report Recording Guide

## Why Video Bug Reports?
A 2-minute video often saves 20 minutes of back-and-forth. Developers can see exactly what happened, making fixes faster and more accurate.

---

## Before Recording Checklist
- [ ] Can you reproduce the bug consistently?
- [ ] Have you cleared cached data (if relevant)?
- [ ] Is your screen recording software ready?
- [ ] Can you show browser console or logs?

---

## Recording Structure

### 1. Environment Information (30 seconds)
State your setup clearly:
> "I'm using:
> - [Browser/App]: Chrome 120 / iOS App v2.3.1
> - [OS]: macOS Sonoma / Windows 11
> - [Account type]: Admin / Standard user
> - [Date/Time]: January 11, 2025, 3:45 PM"

### 2. Bug Summary (15 seconds)
One sentence describing the issue:
> "When I try to [action], the system [unexpected behavior] instead of [expected behavior]."

### 3. Steps to Reproduce (Main content)
Walk through each step slowly:

1. **State the starting point**
   > "Starting from the dashboard..."

2. **Show each action**
   > "I click on 'Settings'..."
   > "I enter this value..."
   > "I click 'Save'..."

3. **Pause after the bug occurs**
   Let the error state be visible for 3-5 seconds

### 4. Expected vs. Actual (30 seconds)
Be explicit:
> "**Expected:** The form should save and show a success message.
> **Actual:** The page freezes and this error appears."

### 5. Show Error Details (if applicable)
If there are error messages or console errors:
- Open browser DevTools (F12)
- Show the Console tab
- Highlight any red errors
- Show Network tab if relevant

### 6. Reproducibility (15 seconds)
> "This happens every time / intermittently / only under certain conditions"

---

## Bug Report Checklist

| Element | Included? |
|---------|-----------|
| Browser/App version | ☐ |
| Operating system | ☐ |
| User account type | ☐ |
| Clear steps to reproduce | ☐ |
| Expected behavior stated | ☐ |
| Actual behavior shown | ☐ |
| Error messages captured | ☐ |
| Console/logs shown (if applicable) | ☐ |

---

## Pro Tips

**Do:**
- Go slowly - developers will pause and analyze
- Show error messages on screen for 3+ seconds
- Mention if it's intermittent vs. consistent
- Include any workarounds you've found

**Don't:**
- Rush through the reproduction steps
- Assume context - state everything
- Skip showing the error state
- Forget to mention recent changes (updates, new plugins, etc.)`,
    min_duration_seconds: 60,
    max_duration_seconds: 600,
    priority: 'high',
    tags: ['bug', 'issue', 'qa', 'testing', 'support', 'error'],
    is_active: true,
    is_system_default: true,
    created_by: SYSTEM_USER_ID,
    evaluation_criteria: {
      version: '1.0',
      passingScore: 80,
      scoringMethod: 'weighted',
      autoAnalyze: true,
      rubricSteps: [
        {
          id: stepId('bug', 1),
          order: 1,
          title: 'Environment Information',
          description:
            'Recording includes environment details: browser/app version, operating system, and any relevant configuration.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: [
              'browser',
              'version',
              'chrome',
              'firefox',
              'safari',
              'windows',
              'mac',
              'ios',
              'android',
            ],
            requiredPhrases: [],
            optionalKeywords: ['operating system', 'app', 'using', 'environment'],
            matchThreshold: 0.4,
          },
          weight: 7,
          isRequired: true,
        },
        {
          id: stepId('bug', 2),
          order: 2,
          title: 'Bug Summary',
          description:
            'A clear, concise summary of the bug is stated - what action triggers it and what goes wrong.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['bug', 'issue', 'problem', 'error', 'when', 'trying'],
            requiredPhrases: [],
            optionalKeywords: ['broken', "doesn't work", 'fails', 'wrong'],
            matchThreshold: 0.5,
          },
          weight: 8,
          isRequired: true,
        },
        {
          id: stepId('bug', 3),
          order: 3,
          title: 'Clear Reproduction Steps',
          description: 'The exact steps to reproduce the bug are shown clearly and deliberately.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['step', 'first', 'then', 'click', 'enter', 'go to'],
            requiredPhrases: [],
            optionalKeywords: ['next', 'after', 'now', 'here'],
            matchThreshold: 0.6,
          },
          visualCriteria: {
            expectedElements: ['cursor movement', 'form inputs', 'button clicks'],
            expectedActions: ['navigation', 'input', 'clicking'],
          },
          weight: 10,
          isRequired: true,
        },
        {
          id: stepId('bug', 4),
          order: 4,
          title: 'Bug Demonstration',
          description:
            'The actual bug/error is clearly shown on screen with sufficient time to observe it.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['see', 'notice', 'here', 'error', 'happening', 'wrong'],
            requiredPhrases: [],
            optionalKeywords: ['look', 'shows', 'appears', 'instead'],
            matchThreshold: 0.5,
          },
          visualCriteria: {
            expectedElements: ['error state', 'broken UI', 'error message'],
            expectedActions: ['error display', 'unexpected behavior'],
          },
          weight: 9,
          isRequired: true,
        },
        {
          id: stepId('bug', 5),
          order: 5,
          title: 'Expected vs. Actual Behavior',
          description:
            'The presenter clearly states what should happen (expected) versus what actually happens (actual).',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: ['expected', 'should', 'instead', 'actual', 'supposed to'],
            requiredPhrases: [],
            optionalKeywords: ['but', 'however', 'normally', 'correct'],
            matchThreshold: 0.6,
          },
          weight: 9,
          isRequired: true,
        },
        {
          id: stepId('bug', 6),
          order: 6,
          title: 'Error Messages Captured',
          description:
            'Any error messages, console errors, or logs are shown and readable on screen.',
          evidenceType: 'both',
          speechCriteria: {
            requiredKeywords: ['error', 'message', 'console', 'log', 'says'],
            requiredPhrases: [],
            optionalKeywords: ['warning', 'exception', 'failed', 'devtools'],
            matchThreshold: 0.4,
          },
          visualCriteria: {
            expectedElements: ['error message', 'console output', 'logs'],
            expectedActions: ['showing error', 'displaying console'],
          },
          weight: 6,
          isRequired: false,
        },
        {
          id: stepId('bug', 7),
          order: 7,
          title: 'Reproducibility Information',
          description:
            'The presenter mentions whether the bug happens consistently, intermittently, or under specific conditions.',
          evidenceType: 'speech',
          speechCriteria: {
            requiredKeywords: [
              'every time',
              'always',
              'sometimes',
              'intermittent',
              'consistent',
              'reproducible',
            ],
            requiredPhrases: [],
            optionalKeywords: ['only', 'when', 'happens', 'occurs', 'conditions'],
            matchThreshold: 0.4,
          },
          weight: 5,
          isRequired: false,
        },
      ],
    },
  };

  // =============================================================================
  // Insert all templates
  // =============================================================================
  const templates = [
    softwareDemoTemplate,
    processDocTemplate,
    trainingVideoTemplate,
    bugReportTemplate,
  ];

  // Insert templates with proper JSON serialization
  for (const template of templates) {
    await knex('task_templates').insert({
      ...template,
      evaluation_criteria: JSON.stringify(template.evaluation_criteria),
      tags: JSON.stringify(template.tags),
    });
  }

  console.log(
    `Seeded ${templates.length} system default task templates with comprehensive rubrics`
  );
}
