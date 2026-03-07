# Creating Templates

Templates are reusable task blueprints that save time and ensure consistency when creating tasks. This guide covers everything you need to know about creating and managing templates in CogVeri.

## What is a Template?

A **template** defines the structure and requirements for a type of task. Templates include:

- **Title and Description** - What the task is about
- **Category** - For organization and filtering
- **Instructions** - Detailed steps for the performer
- **Duration Limits** - Minimum and maximum recording lengths
- **Evaluation Criteria** - The rubric used for AI analysis

Once created, templates can be used to quickly generate tasks with consistent requirements.

---

## Accessing Template Management

To create and manage templates:

1. Navigate to **Settings** from the sidebar
2. Select the **Templates** tab
3. View existing templates or click **Create Template**

---

## Template Fields Explained

### Basic Information

| Field | Description | Required |
|-------|-------------|----------|
| **Title** | The name of the template | Yes |
| **Description** | Brief overview of what tasks from this template involve | Yes |
| **Category** | Organizational category (e.g., Training, Compliance, Sales) | Yes |
| **Icon** | Emoji or icon to visually identify the template | No |

### Recording Settings

| Field | Description | Default |
|-------|-------------|---------|
| **Minimum Duration** | Shortest acceptable recording length | 1 minute |
| **Maximum Duration** | Longest allowed recording length | 10 minutes |
| **Type** | Recording type (screen, camera, or both) | Screen |

### Instructions

The **Instructions** field supports rich text formatting:

- **Headers** - Use ## for sections
- **Lists** - Bullet points and numbered lists
- **Bold/Italic** - Emphasize important points
- **Links** - Reference external resources

Write instructions as if you're explaining the task to someone new.

---

## Creating Your First Template

### Step 1: Open the Template Form

1. Go to **Settings** > **Templates**
2. Click **Create Template**
3. The template form will appear

### Step 2: Fill in Basic Details

Enter the essential information:

\`\`\`
Title: Customer Onboarding Call
Description: Record a demonstration of the customer onboarding process
Category: Training
Icon: 📞
\`\`\`

### Step 3: Set Duration Limits

Consider:
- How long should the task realistically take?
- Is there a minimum time needed to complete all steps?
- What's the maximum reasonable length?

\`\`\`
Minimum Duration: 5 minutes
Maximum Duration: 15 minutes
\`\`\`

### Step 4: Write Clear Instructions

Provide step-by-step guidance:

\`\`\`markdown
## Overview
This task demonstrates the customer onboarding process.

## Steps to Complete

1. **Open the CRM system**
   - Navigate to the customer record
   - Verbally confirm the customer name

2. **Review account setup**
   - Check all required fields are populated
   - Point out any missing information

3. **Walk through key features**
   - Demonstrate the dashboard
   - Show the reporting section
   - Explain notification settings

4. **Confirm completion**
   - Verbally summarize what was covered
   - State any follow-up actions needed

## Tips
- Speak clearly and at a moderate pace
- Pause briefly between major sections
- Ensure all screens are fully visible
\`\`\`

### Step 5: Save the Template

Click **Save Template** to create your template.

---

## Adding a Rubric to Your Template

After creating a template, add evaluation criteria:

1. Find your template in the list
2. Click **Edit Rubric** or the rubric icon
3. Build your rubric using the [Rubric Builder](/knowledge-base/creating-rubrics)
4. Save the rubric

Templates without rubrics will still work, but AI analysis won't be available.

---

## Template Organization

### Using Categories

Organize templates into logical categories:

- **Training** - New employee onboarding, skill development
- **Compliance** - Regulatory checks, policy verification
- **Sales** - Demo recordings, pitch practices
- **Support** - Troubleshooting guides, customer interactions
- **QA** - Quality checks, process audits

### Template Visibility

Templates can be:

- **Active** - Available for creating tasks
- **Inactive** - Hidden from task creation but preserved for history

---

## Template Best Practices

### Write for Your Audience

Consider who will complete tasks from this template:

- New employees may need more detail
- Experienced staff may prefer concise instructions
- Include context for why steps matter

### Be Specific About Expectations

**Instead of:** "Open the application"

**Write:** "Open the Sales Dashboard application and wait for it to fully load. You should see the main dashboard with today's metrics."

### Include Examples

When relevant, show what good completion looks like:

\`\`\`
When explaining the feature, your statement should include:
- What the feature does
- When to use it
- Any limitations

Example: "This is the export feature. Use it when you need
to share data with external systems. Note that exports are
limited to 10,000 records at a time."
\`\`\`

### Set Realistic Durations

- Too short: Performers rush and miss steps
- Too long: Recordings become unfocused
- Just right: Enough time for thorough completion with some buffer

### Update Templates Regularly

Review and update templates when:

- Processes change
- UI/systems are updated
- Feedback suggests confusion
- Analysis shows consistent issues

---

## Managing Existing Templates

### Editing Templates

1. Find the template in the list
2. Click **Edit** or the edit icon
3. Make your changes
4. Save the template

**Note:** Editing a template doesn't affect tasks already created from it.

### Duplicating Templates

To create a similar template:

1. Find the template to copy
2. Click **Duplicate** or the copy icon
3. Modify the duplicate as needed
4. Save with a new name

### Archiving Templates

When a template is no longer needed:

1. Edit the template
2. Set status to **Inactive**
3. The template will be hidden from task creation
4. Historical tasks remain intact

---

## Template Examples

### Example 1: Software Demo

\`\`\`
Title: Product Demo Recording
Category: Sales
Duration: 10-20 minutes

Instructions:
## Demo Structure

1. Introduction (2 min)
   - Introduce yourself
   - State the product name
   - Outline what you'll cover

2. Core Features (10 min)
   - Dashboard overview
   - Key functionality demonstration
   - Common use cases

3. Q&A Simulation (5 min)
   - Address common questions
   - Show where to find help

4. Closing (2 min)
   - Summarize key points
   - Provide next steps
\`\`\`

### Example 2: Compliance Check

\`\`\`
Title: Monthly Security Audit
Category: Compliance
Duration: 5-10 minutes

Instructions:
## Audit Checklist

Complete each verification step and verbally confirm:

1. [ ] Password policy compliance
2. [ ] Two-factor authentication enabled
3. [ ] Software versions current
4. [ ] Backup verification
5. [ ] Access permissions review

State "Verified" or "Issue Found" for each item.
\`\`\`

---

## Troubleshooting

### "Can't find my template"

- Check if it's set to Inactive
- Verify you're in the correct organization
- Use the search/filter options

### "Tasks aren't using the right rubric"

- Edit the template and verify the rubric is attached
- Check if the rubric was saved properly
- Existing tasks keep their original rubric

### "Instructions aren't formatting correctly"

- Use Markdown syntax for formatting
- Preview before saving
- Avoid complex HTML

---

## Next Steps

Now you're ready to create effective templates! Continue learning:

- [Creating Rubrics](/knowledge-base/creating-rubrics) - Build evaluation criteria for your templates
- [Getting Started](/knowledge-base/getting-started) - Review CogVeri fundamentals