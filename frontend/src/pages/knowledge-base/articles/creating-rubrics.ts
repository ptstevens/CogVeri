/**
 * Creating Rubrics - Knowledge Base Article
 */

export const creatingRubricsContent = `
# Creating Rubrics

Rubrics are the foundation of CogVeri's evaluation system. A well-designed rubric ensures consistent, fair, and accurate assessment of task recordings.

## What is a Rubric?

A **rubric** is a structured set of criteria used to evaluate task performance. In CogVeri, rubrics:

- Define specific **steps** that should be observed in the recording
- Specify what type of **evidence** to look for (speech, visual, or both)
- Assign **weights** to indicate the importance of each step
- Mark certain steps as **required** for the task to pass

---

## Accessing the Rubric Builder

To create or edit a rubric:

1. Navigate to **Settings** > **Templates**
2. Select an existing template or create a new one
3. Click the **Edit Rubric** button
4. The Rubric Builder will open

---

## Anatomy of a Rubric Step

Each step in your rubric contains several components:

### Title
A short, descriptive name for the step (e.g., "Open Application", "Verify Settings").

### Description
A detailed explanation of what the evaluator (or AI) should look for. Be specific about:
- What action should be performed
- What should be visible on screen
- What should be said (if applicable)

### Evidence Type

Choose how the step should be evaluated:

| Type | Description | Best For |
|------|-------------|----------|
| **Speech** | Analyzes the audio transcript | Verbal confirmations, explanations, read-alouds |
| **Visual** | Analyzes video frames | UI interactions, screen content, visual confirmations |
| **Both** | Analyzes speech AND visual | Complex steps requiring verbal and visual evidence |

### Speech Criteria

When evidence type includes speech, configure:

- **Required Keywords** - Words that must appear in the transcript
- **Optional Keywords** - Words that strengthen the match if present
- **Match Threshold** - How many keywords must match (0.0 to 1.0)

**Example:**
\`\`\`
Required Keywords: ["settings", "saved", "confirm"]
Optional Keywords: ["successfully", "complete", "done"]
Match Threshold: 0.5 (at least 50% of required keywords)
\`\`\`

### Visual Criteria

When evidence type includes visual, describe:

- **Expected Elements** - UI components that should be visible
- **Expected Actions** - User interactions that should occur

**Example:**
\`\`\`
Expected Elements: ["Settings dialog", "Save button", "Success notification"]
Expected Actions: ["Click save", "Dialog closes"]
\`\`\`

### Weight

Assign a weight from 1-10 to indicate importance:

- **1-3**: Nice to have, minor impact on score
- **4-6**: Important, moderate impact
- **7-10**: Critical, major impact on score

### Required Flag

Mark a step as **Required** if:
- The task cannot pass without completing this step
- It's a critical safety or compliance requirement
- It's a core objective of the task

---

## Building an Effective Rubric

### Step 1: Identify Key Actions

Break down the task into distinct, observable actions:

1. List everything the performer should do
2. Group related actions into single steps
3. Order steps chronologically

### Step 2: Define Clear Criteria

For each step, ask:

- What would I see if this step was done correctly?
- What would I hear if the performer explained their action?
- Is this step binary (done/not done) or can it be partial?

### Step 3: Choose Evidence Types Wisely

**Use Speech when:**
- The action requires verbal confirmation
- Visual evidence might be ambiguous
- You want the performer to explain their reasoning

**Use Visual when:**
- The action has clear visual indicators
- You're checking for specific UI states
- Speech would be redundant or unnecessary

**Use Both when:**
- The step is critical and you want redundant verification
- Both verbal and visual evidence are naturally present
- You want maximum confidence in the evaluation

### Step 4: Balance Your Weights

Consider the overall rubric balance:

- Total weights should reflect relative importance
- Don't make one step dominate the entire score
- Ensure required steps have meaningful weights

---

## Best Practices

### Be Specific with Keywords

**Instead of:** "Open", "Click", "Go"

**Use:** "Open Settings", "Click Save button", "Navigate to Dashboard"

### Avoid Ambiguous Criteria

**Instead of:** "Complete the form correctly"

**Use:** "Fill in name field", "Select date from picker", "Click Submit"

### Consider Edge Cases

Think about:
- What if the performer does steps out of order?
- What if they use keyboard shortcuts instead of clicking?
- What if background noise affects speech detection?

### Test Your Rubric

Before deploying:
1. Have someone complete the task
2. Watch their recording
3. Manually evaluate against your rubric
4. Adjust criteria based on what you observe

---

## Example Rubric: Software Installation Verification

| Step | Evidence | Weight | Required |
|------|----------|--------|----------|
| Open installer | Visual | 3 | Yes |
| Accept license agreement | Both | 5 | Yes |
| Select installation directory | Visual | 4 | No |
| Confirm installation settings | Speech | 4 | No |
| Wait for installation complete | Visual | 6 | Yes |
| Launch application | Visual | 5 | Yes |
| Verify application opens | Both | 8 | Yes |

**Total Weight:** 35 points

**Pass Requirements:**
- All required steps completed
- Minimum score: 60%

---

## Troubleshooting

### "Step always shows as not completed"

- Check if keywords are too specific
- Lower the match threshold
- Add more optional keywords
- Verify the evidence type matches the action

### "Score seems too high/low"

- Review weight distribution
- Check if optional keywords are too broad
- Ensure required steps are marked correctly

### "AI analysis misses obvious actions"

- Add more visual criteria descriptions
- Include synonyms in keywords
- Consider using "Both" evidence type

---

## Next Steps

Now that you understand rubrics, learn how to put them into action:

- [Creating Templates](/knowledge-base/creating-templates) - Build templates that use your rubrics
- [Getting Started](/knowledge-base/getting-started) - Review the basics of CogVeri
`;
