# Feature Implementation Command

## Usage
```
/implement <feature_description>
```

## Description
Orchestrates comprehensive feature implementation with maximum context gathering, SSOT methodology, and seamless integration across the entire BSMarker bird song annotation application.

## Parameters
- `<feature_description>`: Detailed description of the feature to implement

## Workflow

This command orchestrates a systematic feature implementation process:

### 1. Context Gathering Phase
**Delegated to: context-gatherer subagent**
- Retrieve relevant knowledge from memory system
- Analyze existing codebase patterns
- Identify similar implementations
- Map all potential touchpoints
- Document architectural context

### 2. SSOT Analysis Phase  
**Delegated to: ssot-analyzer subagent**
- Identify reusable components and services
- Detect potential code duplications
- Establish single sources of truth
- Create component reusability map
- Plan refactoring if needed

### 3. Integration Planning Phase
**Delegated to: integration-mapper subagent**
- Map frontend components and pages (React/TypeScript)
- Identify backend API endpoints (FastAPI)
- Plan database schema changes (PostgreSQL/SQLAlchemy)
- Check audio processing pipeline (librosa)
- Verify MinIO storage interactions
- Document Docker configuration needs

### 4. Test Development Phase (TDD)
**Delegated to: test-generator subagent**
- Write test specifications first
- Create unit tests for new components
- Update integration tests
- Design E2E test scenarios
- Ensure comprehensive coverage

### 5. Implementation Phase
**Main agent executes with continuous validation**
- Implement database changes (if needed)
- Create/update backend FastAPI services
- Develop frontend React components
- Integrate audio processing features
- Configure spectrogram generation
- Add error handling
- Implement monitoring/metrics

### 6. Finalization Phase
**Main agent completes the implementation**
- Verify Docker configurations
- Update API documentation
- Test in production environment
- Update nginx configuration if needed
- Store implementation knowledge

## Implementation Checklist

The command automatically creates and tracks these todos:

```markdown
- [ ] Feature requirements analyzed
- [ ] Context gathered from knowledge system
- [ ] Similar patterns identified in codebase
- [ ] SSOT analysis completed
- [ ] Reusable components identified
- [ ] Integration points mapped across stack
- [ ] Test specifications written (TDD)
- [ ] Unit tests created
- [ ] Integration tests updated
- [ ] E2E tests designed
- [ ] Database schema updated (if needed)
- [ ] Backend FastAPI services implemented
- [ ] Frontend React components created
- [ ] Audio processing pipeline integrated
- [ ] Spectrogram generation configured
- [ ] MinIO storage setup verified
- [ ] Error handling implemented
- [ ] Monitoring/metrics added
- [ ] Docker configuration verified
- [ ] API documentation updated
- [ ] Production deployment tested
- [ ] Pre-commit hooks passing
- [ ] Knowledge stored for future
```

## Subagent Specifications

### context-gatherer
- Searches knowledge system for patterns
- Analyzes codebase structure
- Identifies integration points
- Documents findings

### ssot-analyzer  
- Finds reusable code
- Detects duplications
- Establishes truth sources
- Creates reuse strategies

### integration-mapper
- Maps all stack layers
- Plans migrations
- Documents touchpoints
- Verifies compatibility

### test-generator
- Writes test specs (TDD)
- Creates comprehensive tests
- Updates existing tests
- Ensures coverage

### i18n-updater
- Updates translations
- Validates completeness
- Checks formatting
- Verifies all languages

## Docker Environment Requirements

```bash
# MANDATORY: Use staging environment only
docker compose -f docker-compose.staging.yml up -d
docker compose -f docker-compose.staging.yml build
docker compose -f docker-compose.staging.yml logs -f

# Testing inside containers
docker exec -it spheroseg-frontend npm run test
docker exec -it spheroseg-backend npm run test
docker exec -it spheroseg-frontend npm run test:e2e

# Validation
docker exec -it spheroseg-frontend npm run lint
docker exec -it spheroseg-frontend npm run type-check
docker exec -it spheroseg-frontend npm run i18n:validate
```

## Knowledge Management Protocol

### Before Implementation
Query knowledge system for:
- `"[feature-type] implementation patterns"`
- `"existing [component-type] implementations"`  
- `"[service-name] integration examples"`
- `"testing strategies [feature-type]"`

### After Implementation
Store in knowledge system:
- Implementation patterns and decisions
- Integration solutions
- Successful test strategies
- Performance optimizations
- Troubleshooting solutions

## Success Criteria

✅ Feature works across entire stack
✅ No code duplication (SSOT maintained)
✅ All tests passing (unit, integration, E2E)
✅ Translations complete (EN, CS, ES, DE, FR, ZH)
✅ API documentation current
✅ Performance metrics acceptable
✅ Staging deployment successful
✅ Knowledge documented
✅ Pre-commit hooks passing

## Error Prevention Rules

1. **Never duplicate code** - Always check existing implementations
2. **Follow patterns** - Use established codebase conventions
3. **Maintain compatibility** - Don't break existing features
4. **Test first** - TDD is mandatory
5. **Validate translations** - All languages must be complete
6. **Use Docker** - Never run commands outside containers
7. **Document changes** - Update all relevant documentation

## Example Usage

```
/implement "Add bulk export functionality that allows users to export multiple segmentation results at once in COCO or Excel format with progress tracking"
```

This will trigger the complete implementation workflow with all phases and validations.
