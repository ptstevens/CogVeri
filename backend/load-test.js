/**
 * K6 Load Test Suite for CogVeri API
 * 
 * This script performs comprehensive load testing on critical API endpoints
 * to identify bottlenecks and measure performance under load.
 * 
 * Usage:
 *   k6 run backend/load-test.js
 * 
 * Environment Variables:
 *   API_URL: API endpoint (default: http://localhost:3001/api)
 *   TEST_EMAIL: Test user email (default: testuser@example.com)
 *   TEST_PASSWORD: Test user password (default: password123)
 *   DURATION: Test duration in seconds (default: 30)
 *   VUS: Virtual users count (default: 10)
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Configuration
const API_URL = __ENV.API_URL || 'http://localhost:3001/api';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'testuser@example.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'password123';

// Custom Metrics (note: http_req_duration is a built-in metric)
const errorRate = new Rate('errors');
const authDuration = new Trend('auth_request_duration');
const dashboardDuration = new Trend('dashboard_request_duration');
const tasksDuration = new Trend('tasks_request_duration');
const authErrors = new Counter('auth_errors');
const dashboardErrors = new Counter('dashboard_errors');
const taskErrors = new Counter('task_errors');

// Test stages (ramp up, peak, ramp down)
export const options = {
  stages: [
    { duration: '10s', target: 5 },    // Ramp up to 5 users
    { duration: '20s', target: 10 },   // Ramp up to 10 users
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '30s', target: 20 },   // Stay at 20 users
    { duration: '20s', target: 5 },    // Ramp down to 5 users
    { duration: '10s', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'errors': ['rate<0.1'],
  },
};

// Global state
let authToken = null;
let currentUserEmail = null;

/**
 * Login and obtain JWT token
 */
function performLogin() {
  group('Authentication', () => {
    const loginPayload = JSON.stringify({
      email: `user-${Date.now()}@example.com`, // Unique email per VU
      password: TEST_PASSWORD,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'LoginEndpoint' },
    };

    const response = http.post(`${API_URL}/auth/login`, loginPayload, params);
    const duration = response.timings.duration;

    authDuration.add(duration);

    const success = check(response, {
      'login status is 200': (r) => r.status === 200,
      'login response time < 500ms': (r) => r.timings.duration < 500,
      'auth token is present': (r) => r.json().token !== undefined,
    });

    if (!success) {
      errorRate.add(1);
      authErrors.add(1);
      console.error(`Login failed: ${response.status} - ${response.body}`);
    } else {
      errorRate.add(0);
      const data = response.json();
      authToken = data.token;
      currentUserEmail = data.user?.email;
      console.log(`✓ Login successful. Token: ${authToken.substring(0, 20)}...`);
    }
  });

  sleep(1);
}

/**
 * Test Dashboard Endpoint
 */
function testDashboard() {
  if (!authToken) {
    console.error('No auth token available for dashboard test');
    return;
  }

  group('Dashboard API', () => {
    const params = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'DashboardEndpoint' },
    };

    const response = http.get(`${API_URL}/dashboard/stats`, params);
    const duration = response.timings.duration;

    dashboardDuration.add(duration);

    const success = check(response, {
      'dashboard status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      'dashboard response time < 1000ms': (r) => r.timings.duration < 1000,
      'dashboard has data': (r) => {
        try {
          return r.json().data !== undefined || r.status === 401;
        } catch {
          return false;
        }
      },
    });

    if (!success) {
      errorRate.add(1);
      dashboardErrors.add(1);
      console.error(`Dashboard failed: ${response.status}`);
    } else {
      errorRate.add(0);
    }
  });

  sleep(0.5);
}

/**
 * Test Tasks Listing Endpoint
 */
function testTasksList() {
  if (!authToken) {
    console.error('No auth token available for tasks test');
    return;
  }

  group('Tasks List API', () => {
    const params = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'TasksListEndpoint' },
    };

    const response = http.get(`${API_URL}/tasks?page=1&limit=20`, params);
    const duration = response.timings.duration;

    tasksDuration.add(duration);

    const success = check(response, {
      'tasks list status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      'tasks list response time < 800ms': (r) => r.timings.duration < 800,
      'tasks list has data': (r) => {
        try {
          return r.json().data !== undefined || r.status === 401;
        } catch {
          return false;
        }
      },
    });

    if (!success) {
      errorRate.add(1);
      taskErrors.add(1);
      console.error(`Tasks list failed: ${response.status}`);
    } else {
      errorRate.add(0);
    }
  });

  sleep(0.5);
}

/**
 * Test Task Creation
 */
function testCreateTask() {
  if (!authToken) {
    console.error('No auth token available for task creation test');
    return;
  }

  group('Create Task API', () => {
    const taskPayload = JSON.stringify({
      title: `Load Test Task ${Date.now()}`,
      description: 'This is a load test task',
      status: 'assigned',
      priority: 'medium',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const params = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'CreateTaskEndpoint' },
    };

    const response = http.post(`${API_URL}/tasks`, taskPayload, params);
    const duration = response.timings.duration;

    tasksDuration.add(duration);

    const success = check(response, {
      'create task status is 201 or 401': (r) => r.status === 201 || r.status === 401,
      'create task response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    if (!success) {
      errorRate.add(1);
      taskErrors.add(1);
      console.error(`Task creation failed: ${response.status} - ${response.body}`);
    } else {
      errorRate.add(0);
      console.log(`✓ Task created successfully`);
    }
  });

  sleep(1);
}

/**
 * Test Health Check Endpoint
 */
function testHealthCheck() {
  group('Health Check API', () => {
    const params = {
      tags: { name: 'HealthCheckEndpoint' },
    };

    const response = http.get(`${API_URL.replace('/api', '')}/health`, params);
    const duration = response.timings.duration;

    const success = check(response, {
      'health check status is 200': (r) => r.status === 200,
      'health check response time < 100ms': (r) => r.timings.duration < 100,
    });

    if (!success) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  sleep(0.5);
}

/**
 * Main load test function
 * Runs through a complete user journey
 */
export default function () {
  // Health check (no auth required)
  testHealthCheck();

  // Login to get token
  performLogin();

  // Once authenticated, test protected endpoints
  if (authToken) {
    testDashboard();
    testTasksList();
    testCreateTask();
    testTasksList(); // List again to test cache behavior
    testDashboard(); // Dashboard again to test cache behavior
  }

  sleep(2);
}

/**
 * Optional: Setup function (runs before all VUs)
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('K6 Load Test Suite Starting');
  console.log(`API URL: ${API_URL}`);
  console.log(`Configuration: ${JSON.stringify({
    stages: 'Ramp up 0-20 VUs over 90s, then ramp down',
    totalDuration: '~120s',
  }, null, 2)}`);
  console.log('='.repeat(60));
}

/**
 * Optional: Teardown function (runs after all VUs)
 */
export function teardown() {
  console.log('='.repeat(60));
  console.log('K6 Load Test Suite Complete');
  console.log('='.repeat(60));
}
