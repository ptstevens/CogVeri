#!/bin/bash

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNiNDY1NTMzLTM5MjMtNDU2ZS1hMDA3LTliODBkY2Q4ODgzOCIsImVtYWlsIjoidGVzdHVzZXJAcmVsYXkuY29tcGFueS5jb20iLCJyb2xlIjoiZW1wbG95ZWUiLCJuYW1lIjoiVGVzdCBVc2VyIiwiaWF0IjoxNzU5ODg0MzQ1LCJleHAiOjE3NjA0ODkxNDV9.N8yyBF5G1BrwYIKWHKp-3YrB2sfdFbsBhYyTBySCByY"

# Create a task
echo "Creating task..."
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Complete Onboarding Documentation",
    "description": "Record a walkthrough of our onboarding process for new employees",
    "type": "recording",
    "priority": "high",
    "assigned_to": "cb465533-3923-456e-a007-9b80dcd88838",
    "due_date": "2025-10-15T15:00:00Z",
    "estimated_duration": 30,
    "tags": ["onboarding", "documentation"]
  }' | jq

echo ""
echo "Getting all tasks..."
curl -s http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" | jq

echo ""
echo "Getting task statistics..."
curl -s http://localhost:3000/api/tasks/statistics \
  -H "Authorization: Bearer $TOKEN" | jq