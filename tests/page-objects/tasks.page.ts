/**
 * Tasks Page Object
 *
 * Task list and management including:
 * - Task list view and Kanban view
 * - Task creation modal
 * - Task filtering and search
 * - Task actions (edit, delete, etc.)
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { TIMEOUTS, ROUTES, TASK_STATUSES, TASK_PRIORITIES } from '../fixtures/test-data';

export class TasksPage extends BasePage {
  readonly path = ROUTES.tasks;

  constructor(page: Page) {
    super(page);
  }

  // ============================================================================
  // LOCATORS - Page Header & Controls
  // ============================================================================

  get pageTitle(): Locator {
    return this.page.locator('h1:has-text("Tasks"), [data-testid="page-title"]').first();
  }

  get createTaskButton(): Locator {
    return this.page
      .locator(
        '[data-testid="create-task"], button:has-text("Create Task"), button:has-text("New Task"), button:has-text("Add Task")'
      )
      .first();
  }

  get searchInput(): Locator {
    return this.page
      .locator('[data-testid="task-search"], input[placeholder*="search" i], input[type="search"]')
      .first();
  }

  get statusFilter(): Locator {
    return this.page
      .locator('[data-testid="status-filter"], select[name="status"], [aria-label*="status" i]')
      .first();
  }

  get priorityFilter(): Locator {
    return this.page
      .locator(
        '[data-testid="priority-filter"], select[name="priority"], [aria-label*="priority" i]'
      )
      .first();
  }

  get listViewButton(): Locator {
    return this.page
      .locator('[data-testid="list-view"], button[aria-label*="list" i], button:has-text("List")')
      .first();
  }

  get kanbanViewButton(): Locator {
    return this.page
      .locator(
        '[data-testid="kanban-view"], button[aria-label*="kanban" i], button[aria-label*="board" i], button:has-text("Kanban")'
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Statistics Cards
  // ============================================================================

  get statsCards(): Locator {
    return this.page.locator('[data-testid="task-stats"], [class*="stats" i]');
  }

  getStatCard(status: string): Locator {
    return this.page
      .locator(`[data-testid="stat-${status}"], [class*="stat" i]:has-text("${status}")`)
      .first();
  }

  // ============================================================================
  // LOCATORS - Task List
  // ============================================================================

  get taskList(): Locator {
    return this.page
      .locator('[data-testid="task-list"], [class*="task-list" i], [role="list"]')
      .first();
  }

  get taskCards(): Locator {
    return this.page.locator(
      '[data-testid="task-card"], [class*="task-card" i], [class*="task-item" i]'
    );
  }

  getTaskCard(titleOrId: string): Locator {
    return this.page
      .locator(
        `[data-testid="task-card"]:has-text("${titleOrId}"), [class*="task" i]:has-text("${titleOrId}")`
      )
      .first();
  }

  getTaskCardByStatus(status: string): Locator {
    return this.page.locator(
      `[data-testid="task-card"]:has([data-status="${status}"]), [class*="task" i]:has([class*="${status}" i])`
    );
  }

  // ============================================================================
  // LOCATORS - Task Card Elements
  // ============================================================================

  getTaskTitle(card: Locator): Locator {
    return card.locator('[data-testid="task-title"], h3, h4, [class*="title" i]').first();
  }

  getTaskDescription(card: Locator): Locator {
    return card.locator('[data-testid="task-description"], p, [class*="description" i]').first();
  }

  getTaskStatus(card: Locator): Locator {
    return card
      .locator('[data-testid="task-status"], [class*="status" i], [class*="badge" i]')
      .first();
  }

  getTaskPriority(card: Locator): Locator {
    return card.locator('[data-testid="task-priority"], [class*="priority" i]').first();
  }

  getTaskAssignee(card: Locator): Locator {
    return card
      .locator('[data-testid="task-assignee"], [class*="assignee" i], [class*="assigned" i]')
      .first();
  }

  getTaskDueDate(card: Locator): Locator {
    return card
      .locator('[data-testid="task-due-date"], [class*="due" i], [class*="date" i]')
      .first();
  }

  getTaskMenu(card: Locator): Locator {
    return card
      .locator(
        '[data-testid="task-menu"], button[aria-label*="menu" i], button:has(svg[class*="dots" i]), [class*="menu" i]'
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Kanban Board
  // ============================================================================

  get kanbanBoard(): Locator {
    return this.page
      .locator('[data-testid="kanban-board"], [class*="kanban" i], [class*="board" i]')
      .first();
  }

  getKanbanColumn(status: string): Locator {
    return this.page
      .locator(
        `[data-testid="kanban-column-${status}"], [data-status="${status}"], [class*="column" i]:has-text("${status}")`
      )
      .first();
  }

  getKanbanColumnTasks(status: string): Locator {
    return this.getKanbanColumn(status).locator('[data-testid="task-card"], [class*="task" i]');
  }

  // ============================================================================
  // LOCATORS - Create Task Modal
  // ============================================================================

  get createTaskModal(): Locator {
    return this.page
      .locator(
        '[data-testid="create-task-modal"], [role="dialog"]:has-text("Create Task"), [role="dialog"]:has-text("New Task")'
      )
      .first();
  }

  get taskTitleInput(): Locator {
    return this.createTaskModal
      .locator(
        'input[name="title"], [data-testid="task-title-input"], input[placeholder*="title" i]'
      )
      .first();
  }

  get taskDescriptionInput(): Locator {
    return this.createTaskModal
      .locator(
        'textarea[name="description"], [data-testid="task-description-input"], [contenteditable="true"]'
      )
      .first();
  }

  get taskTypeSelect(): Locator {
    return this.createTaskModal
      .locator('select[name="type"], [data-testid="task-type-select"]')
      .first();
  }

  get taskPrioritySelect(): Locator {
    return this.createTaskModal
      .locator('select[name="priority"], [data-testid="task-priority-select"]')
      .first();
  }

  get taskDueDateInput(): Locator {
    return this.createTaskModal
      .locator('input[type="date"], input[name="dueDate"], [data-testid="task-due-date"]')
      .first();
  }

  get taskAssigneeSelect(): Locator {
    return this.createTaskModal
      .locator('select[name="assignedTo"], [data-testid="task-assignee-select"]')
      .first();
  }

  get taskRubricSelect(): Locator {
    return this.createTaskModal
      .locator('select[name="rubric"], [data-testid="task-rubric-select"]')
      .first();
  }

  get createTaskSubmitButton(): Locator {
    return this.createTaskModal
      .locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")')
      .first();
  }

  get createTaskCancelButton(): Locator {
    return this.createTaskModal
      .locator('button:has-text("Cancel"), button[data-testid="cancel"]')
      .first();
  }

  // ============================================================================
  // LOCATORS - Send to External Tab
  // ============================================================================

  get sendTab(): Locator {
    return this.createTaskModal
      .locator('[data-testid="tab-send"], button:has-text("Send"), [role="tab"]:has-text("Send")')
      .first();
  }

  get externalEmailInput(): Locator {
    return this.createTaskModal
      .locator('input[name="externalEmail"], [data-testid="external-email"], input[type="email"]')
      .first();
  }

  get generateLinkButton(): Locator {
    return this.createTaskModal
      .locator('button:has-text("Generate Link"), button:has-text("Create Link")')
      .first();
  }

  get magicLinkDisplay(): Locator {
    return this.createTaskModal
      .locator('[data-testid="magic-link"], input[readonly], [class*="link" i]')
      .first();
  }

  get copyLinkButton(): Locator {
    return this.createTaskModal
      .locator('button:has-text("Copy"), button[aria-label*="copy" i]')
      .first();
  }

  // ============================================================================
  // LOCATORS - Empty State
  // ============================================================================

  get emptyState(): Locator {
    return this.page
      .locator(
        '[data-testid="no-tasks"], [class*="empty" i]:has-text("task"), p:has-text("No tasks")'
      )
      .first();
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Wait for tasks page to load
   */
  async waitForTasksLoad(): Promise<void> {
    await this.waitForLoadingToComplete();
    await expect(this.pageTitle.or(this.taskList).or(this.emptyState)).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /**
   * Open create task modal
   */
  async openCreateTaskModal(): Promise<void> {
    await this.createTaskButton.click();
    await expect(this.createTaskModal).toBeVisible({ timeout: TIMEOUTS.short });
  }

  /**
   * Create a new task
   */
  async createTask(taskData: {
    title: string;
    description?: string;
    type?: 'recording' | 'live_demo' | 'hybrid';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    dueDate?: string;
    assignedTo?: string;
  }): Promise<void> {
    await this.openCreateTaskModal();
    await this.taskTitleInput.fill(taskData.title);

    if (taskData.description) {
      await this.taskDescriptionInput.fill(taskData.description);
    }

    if (taskData.type) {
      await this.taskTypeSelect.selectOption(taskData.type);
    }

    if (taskData.priority) {
      await this.taskPrioritySelect.selectOption(taskData.priority);
    }

    if (taskData.dueDate) {
      await this.taskDueDateInput.fill(taskData.dueDate);
    }

    if (taskData.assignedTo) {
      await this.taskAssigneeSelect.selectOption(taskData.assignedTo);
    }

    await this.createTaskSubmitButton.click();
    await expect(this.createTaskModal).not.toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Create task and send to external contributor
   */
  async createTaskForExternal(taskData: {
    title: string;
    description?: string;
    externalEmail: string;
  }): Promise<string> {
    await this.openCreateTaskModal();
    await this.taskTitleInput.fill(taskData.title);

    if (taskData.description) {
      await this.taskDescriptionInput.fill(taskData.description);
    }

    // Go to Send tab
    await this.sendTab.click();
    await this.externalEmailInput.fill(taskData.externalEmail);
    await this.generateLinkButton.click();

    // Wait for link to be generated
    await expect(this.magicLinkDisplay).toBeVisible({ timeout: TIMEOUTS.medium });
    const link = await this.magicLinkDisplay.inputValue();

    await this.createTaskSubmitButton.click();
    return link;
  }

  /**
   * Search for tasks
   */
  async searchTasks(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500); // Debounce
    await this.waitForLoadingToComplete();
  }

  /**
   * Filter by status
   */
  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.selectOption(status);
    await this.waitForLoadingToComplete();
  }

  /**
   * Filter by priority
   */
  async filterByPriority(priority: string): Promise<void> {
    await this.priorityFilter.selectOption(priority);
    await this.waitForLoadingToComplete();
  }

  /**
   * Switch to list view
   */
  async switchToListView(): Promise<void> {
    await this.listViewButton.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Switch to kanban view
   */
  async switchToKanbanView(): Promise<void> {
    await this.kanbanViewButton.click();
    await expect(this.kanbanBoard).toBeVisible({ timeout: TIMEOUTS.short });
  }

  /**
   * Click on a task to view details
   */
  async clickTask(titleOrId: string): Promise<void> {
    const card = this.getTaskCard(titleOrId);
    await card.click();
  }

  /**
   * Open task menu
   */
  async openTaskMenu(titleOrId: string): Promise<void> {
    const card = this.getTaskCard(titleOrId);
    await this.getTaskMenu(card).click();
  }

  /**
   * Delete a task via menu
   */
  async deleteTask(titleOrId: string): Promise<void> {
    await this.openTaskMenu(titleOrId);
    await this.page
      .locator('button:has-text("Delete"), [role="menuitem"]:has-text("Delete")')
      .click();
    // Confirm deletion if dialog appears
    if (await this.modal.isVisible()) {
      await this.confirmModal();
    }
    await this.waitForLoadingToComplete();
  }

  /**
   * Get count of visible tasks
   */
  async getTaskCount(): Promise<number> {
    await this.waitForLoadingToComplete();
    return this.taskCards.count();
  }

  // ============================================================================
  // ASSERTIONS
  // ============================================================================

  /**
   * Assert task exists in list
   */
  async assertTaskExists(title: string): Promise<void> {
    await expect(this.getTaskCard(title)).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Assert task does not exist
   */
  async assertTaskNotExists(title: string): Promise<void> {
    await expect(this.getTaskCard(title)).not.toBeVisible({ timeout: TIMEOUTS.short });
  }

  /**
   * Assert task has status
   */
  async assertTaskHasStatus(title: string, status: string): Promise<void> {
    const card = this.getTaskCard(title);
    const statusBadge = this.getTaskStatus(card);
    await expect(statusBadge).toContainText(status, { ignoreCase: true });
  }

  /**
   * Assert empty state is shown
   */
  async assertEmptyState(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }

  /**
   * Assert task count
   */
  async assertTaskCount(expectedCount: number): Promise<void> {
    const count = await this.getTaskCount();
    expect(count).toBe(expectedCount);
  }

  /**
   * Assert create task modal is open
   */
  async assertCreateModalOpen(): Promise<void> {
    await expect(this.createTaskModal).toBeVisible();
  }

  /**
   * Assert create task modal is closed
   */
  async assertCreateModalClosed(): Promise<void> {
    await expect(this.createTaskModal).not.toBeVisible();
  }
}
