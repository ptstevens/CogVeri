# Relay - Internal Knowledge Demonstration Platform

## Overview

Relay is a browser-based internal platform that enables employees to securely demonstrate their understanding of business systems, workflows, and feature configurations through self-guided or live-recorded screen sessions. The platform provides a seamless workflow for task assignment, screen recording, review, and feedback—all integrated within the company network with SSO and Slack support.

## Key Features

- **Task Assignment**: Team leads and managers can create, assign, and track screen recording or live demo tasks
- **Browser-Based Recording**: No installations required - employees can record or share screens directly from Chrome
- **Secure Review System**: Reviewers can watch recordings and provide actionable feedback
- **SSO Authentication**: Secure login via company SSO with role-based access control
- **Slack Integration**: Optional notifications for task assignments, submissions, and feedback
- **Audit Trail**: All recordings and feedback are securely stored and searchable for compliance

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **React Router** for navigation
- **React Query** for data fetching
- **Socket.io** for real-time updates

### Backend
- **Node.js** with Express and TypeScript
- **PostgreSQL** for data persistence
- **AWS S3** (or equivalent) for video storage
- **JWT** for session management
- **Passport.js** for SSO integration
- **Socket.io** for WebSocket connections

## Project Structure

```
relay/
├── frontend/           # React frontend application
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Page components
│   │   ├── contexts/   # React contexts
│   │   ├── hooks/      # Custom React hooks
│   │   ├── services/   # API services
│   │   ├── types/      # TypeScript type definitions
│   │   └── utils/      # Utility functions
│   └── public/         # Static assets
├── backend/            # Node.js backend API
│   ├── src/
│   │   ├── controllers/# Request handlers
│   │   ├── models/     # Database models
│   │   ├── routes/     # API routes
│   │   ├── middleware/ # Express middleware
│   │   ├── services/   # Business logic
│   │   └── utils/      # Utility functions
│   └── migrations/     # Database migrations
└── docs/              # Documentation

```

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 14+
- AWS account (for S3 storage) or equivalent cloud storage
- Company SSO provider configuration

### Installation

1. Clone the repository:
```bash
git clone https://github.com/company/relay.git
cd relay
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Copy example env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

4. Configure your environment variables in the `.env` files

5. Run database migrations:
```bash
npm run db:migrate --workspace=backend
```

6. Start development servers:
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Development

### Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run build` - Build both applications for production
- `npm run test` - Run tests for both applications
- `npm run lint` - Run ESLint on both applications
- `npm run format` - Format code with Prettier

### Backend Scripts
- `npm run dev:backend` - Start backend in development mode
- `npm run build:backend` - Build backend for production
- `npm run test:backend` - Run backend tests
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with test data

### Frontend Scripts
- `npm run dev:frontend` - Start frontend in development mode
- `npm run build:frontend` - Build frontend for production
- `npm run test:frontend` - Run frontend tests

## Testing

The project uses:
- **Jest** for backend unit and integration testing
- **Vitest** for frontend component testing
- **React Testing Library** for React component testing
- **Supertest** for API endpoint testing

Run tests with:
```bash
npm run test
```

## Deployment

### Production Build

1. Build the applications:
```bash
npm run build
```

2. The production files will be in:
   - Backend: `backend/dist/`
   - Frontend: `frontend/dist/`

### Docker Deployment

Build and run with Docker:
```bash
docker-compose up --build
```

## Security Considerations

- All data transmission uses HTTPS
- Video recordings are encrypted at rest
- SSO authentication required for all access
- Role-based access control (RBAC) implemented
- Regular security audits recommended
- No external data transmission - fully internal

## Browser Support

Initially supporting:
- Chrome 90+

Future support planned for:
- Firefox 90+
- Safari 14+
- Edge 90+

## Contributing

This is an internal company project. Please follow the company's development guidelines and submit pull requests for review.

## License

PROPRIETARY - Internal Use Only

## Support

For issues and questions, please contact the Internal Development Team or create an issue in the internal GitHub repository.