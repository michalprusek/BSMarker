# BSMarker Code Style and Conventions

## Python Backend (FastAPI)

### Code Style
- **Formatter**: Black (line length 88)
- **Linter**: Pylint 
- **Type Checker**: MyPy with strict mode
- **Import Style**: Absolute imports, grouped by standard/third-party/local
- **Docstrings**: Google style with type hints

### Architecture Patterns
- **Layered Architecture**: API → Services → Models → Database
- **Dependency Injection**: FastAPI dependencies for database sessions
- **Repository Pattern**: Service layer abstracts database operations
- **Error Handling**: HTTPException with proper status codes
- **Async/Await**: Used throughout for database and file operations

### File Structure
```
backend/app/
├── api/           # FastAPI routers and endpoints
├── core/          # Configuration, security, celery
├── db/            # Database connection and base classes
├── models/        # SQLAlchemy models
├── schemas/       # Pydantic schemas for validation
├── services/      # Business logic layer
└── tasks/         # Celery background tasks
```

### Naming Conventions
- **Variables/Functions**: snake_case
- **Classes**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Database Tables**: lowercase with underscores
- **API Endpoints**: kebab-case in URLs, snake_case in schemas

## TypeScript Frontend (React)

### Code Style
- **Formatter**: Prettier
- **Linter**: ESLint with TypeScript rules
- **Type Safety**: Strict TypeScript configuration
- **Component Style**: Functional components with hooks

### Architecture Patterns
- **Component Structure**: Atomic design principles
- **State Management**: React Context for global state, local state for components
- **API Layer**: Centralized axios client with interceptors
- **Error Handling**: Try-catch with toast notifications
- **Form Handling**: React Hook Form with validation

### File Structure
```
frontend/src/
├── components/    # Reusable UI components
├── contexts/      # React context providers
├── pages/         # Route-level components
├── services/      # API client and utilities
├── types/         # TypeScript type definitions
└── utils/         # Helper functions
```

### Naming Conventions
- **Components**: PascalCase (e.g., `AnnotationEditor.tsx`)
- **Files**: PascalCase for components, camelCase for utilities
- **Variables/Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **CSS Classes**: Tailwind utility classes

## Database Conventions

### SQLAlchemy Models
- **Table Names**: Plural, lowercase with underscores
- **Column Names**: snake_case
- **Foreign Keys**: `{table}_id` format
- **Timestamps**: `created_at`, `updated_at` with timezone support
- **Enums**: Python enums for status fields

### Migration Strategy
- **Manual Migrations**: Direct SQLAlchemy metadata operations
- **Schema Evolution**: Additive changes preferred
- **Data Migration**: Separate scripts for data transformations

## API Design

### REST Conventions
- **URL Structure**: `/api/v1/{resource}/{id}`
- **HTTP Methods**: GET (read), POST (create), PUT (update), DELETE
- **Status Codes**: 200 (OK), 201 (Created), 400 (Bad Request), 404 (Not Found), 500 (Server Error)
- **Response Format**: JSON with consistent error structure

### Authentication
- **JWT Tokens**: Bearer token authentication
- **Role-Based Access**: Admin and user roles
- **Permission Checks**: Per-endpoint authorization

### Error Response Format
```json
{
  "detail": "Error message",
  "error_code": "VALIDATION_ERROR",
  "field_errors": { "field": ["error message"] }
}
```
