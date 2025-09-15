---
name: optimize
description: Performance optimization with intelligent bottleneck analysis and automated improvements
argument-hint: [component/service] [--aggressive] [--measure-only]
---

# Overview

This command performs comprehensive performance optimization of the BSMarker application by analyzing bottlenecks, implementing targeted improvements, and measuring results. It uses parallel agents for analysis and can optimize specific components or the entire stack.

## Variables

- `$ARGUMENTS`: Target component or optimization flags
  - Component names: `frontend`, `backend`, `database`, `ml`, `all`
  - `--aggressive`: Apply more aggressive optimizations
  - `--measure-only`: Only measure performance without making changes

## Instructions

1. **Baseline Measurement**: Capture current performance metrics
2. **Bottleneck Analysis**: Deploy specialized agents to identify issues
3. **Strategy Design**: Create optimization plan based on findings
4. **Implementation**: Apply optimizations systematically
5. **Verification**: Measure improvements and validate changes
6. **Knowledge Storage**: Document successful optimizations

## Workflow

### Phase 1: Performance Baseline
```bash
echo "📊 Capturing performance baseline..."

# System metrics
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Database query performance
docker exec bsmarker-backend npm run db:analyze 2>&1 | head -30 || echo "Database analysis not available"

# Frontend bundle size
cd /home/prusek/BSMarker/frontend && npm run analyze 2>&1 | head -20 || echo "Bundle analysis not available"

# API response times
for endpoint in /health /api/recordings /api/users; do
    echo "Testing $endpoint:"
    docker exec bsmarker-backend curl -w "Response time: %{time_total}s\n" -o /dev/null -s "http://localhost:8000$endpoint"
done

# Memory usage
docker exec bsmarker-backend node -e "console.log('Backend Memory:', process.memoryUsage())"
docker exec bsmarker-ml python -c "import psutil; print(f'ML Memory: {psutil.virtual_memory()}')"

# Cache performance
docker exec bsmarker-redis redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses|evicted_keys"

# Recent errors
docker logs bsmarker-backend --tail 100 2>&1 | grep -E "error|Error|ERROR|slow|timeout" | tail -10
```

### Phase 2: Bottleneck Analysis

Deploy specialized agents in parallel for comprehensive analysis:

```python
# Agent deployment strategy
agents_to_deploy = [
    {
        "agent": "context-gatherer",
        "task": f"Analyze all components related to {ARGUMENTS} for performance impact"
    },
    {
        "agent": "performance-debugger",
        "task": f"Identify bottlenecks in {ARGUMENTS}: slow queries, memory leaks, CPU spikes, network latency"
    },
    {
        "agent": "ssot-analyzer",
        "task": f"Find code duplication and inefficient patterns in {ARGUMENTS}"
    }
]

# Add specialized agents based on target
if "frontend" in ARGUMENTS:
    agents_to_deploy.append({
        "agent": "frontend-debugger",
        "task": "Analyze React performance: re-renders, bundle size, lazy loading opportunities"
    })

if "backend" in ARGUMENTS or "database" in ARGUMENTS:
    agents_to_deploy.append({
        "agent": "backend-debugger",
        "task": "Check API and database performance: N+1 queries, missing indexes, connection pooling"
    })

if "ml" in ARGUMENTS:
    agents_to_deploy.append({
        "agent": "ml-debugger",
        "task": "Analyze ML model performance: inference time, GPU utilization, memory usage"
    })

# Deploy all agents in parallel
```

### Phase 3: Optimization Implementation

Based on analysis findings, apply targeted optimizations:

#### Frontend Optimizations
```javascript
if (target.includes('frontend')) {
    // React performance improvements
    - Implement React.memo for expensive components
    - Add useMemo/useCallback for computations
    - Enable code splitting with lazy loading
    - Optimize bundle with tree shaking
    - Implement virtual scrolling for lists
    - Add service worker for caching
    - Compress images and assets
    - Use intersection observer for lazy loading
}
```

#### Backend Optimizations
```javascript
if (target.includes('backend')) {
    // API and database improvements
    - Add database indexes for frequent queries
    - Implement query result caching with Redis
    - Optimize N+1 queries with eager loading
    - Add connection pooling
    - Implement request batching
    - Add compression middleware
    - Optimize serialization
    - Implement pagination for large datasets
}
```

#### Database Optimizations
```sql
-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_recordings_user_id ON recordings(user_id);
CREATE INDEX CONCURRENTLY idx_annotations_recording_id ON annotations(recording_id);
CREATE INDEX CONCURRENTLY idx_annotations_created_at ON annotations(created_at DESC);

-- Optimize queries
VACUUM ANALYZE recordings;
VACUUM ANALYZE annotations;

-- Update statistics
ANALYZE;
```

#### ML Service Optimizations
```python
if target == 'ml':
    # Model inference improvements
    - Enable model quantization
    - Implement batch processing
    - Add result caching for identical inputs
    - Optimize image preprocessing pipeline
    - Use GPU acceleration where available
    - Implement model pruning
    - Add async processing queue
```

#### Infrastructure Optimizations
```yaml
# Docker resource tuning
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

# Nginx optimizations
- Enable gzip compression
- Add browser caching headers
- Implement rate limiting
- Enable HTTP/2
```

### Phase 4: Performance Verification
```bash
echo "📈 Measuring performance improvements..."

# Re-run baseline measurements
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Compare API response times
echo "API Response Time Comparison:"
for endpoint in /health /api/recordings /api/users; do
    echo "$endpoint:"
    docker exec bsmarker-backend curl -w "After: %{time_total}s\n" -o /dev/null -s "http://localhost:8000$endpoint"
done

# Memory usage after optimizations
docker exec bsmarker-backend node -e "console.log('Optimized Memory:', process.memoryUsage())"

# Cache hit rate improvement
docker exec bsmarker-redis redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"

# Run performance tests
npm run test:performance 2>&1 || echo "Performance tests not configured"
```

### Phase 5: Knowledge Storage

Store successful optimization patterns:

```javascript
// Document optimization results
const optimizationResults = {
    target: ARGUMENTS,
    bottlenecks: [/* identified issues */],
    optimizations: [/* applied fixes */],
    improvements: {
        responseTime: "X% reduction",
        memoryUsage: "Y% reduction",
        bundleSize: "Z% reduction",
        cacheHitRate: "W% improvement"
    },
    patterns: [/* reusable patterns */]
};

// Store in knowledge base for future reference
```

## Report

### Optimization Summary
- **Target**: ${ARGUMENTS}
- **Mode**: ${MODE:-"standard"}
- **Analysis Duration**: [time]
- **Implementation Duration**: [time]

### Performance Improvements
```
📊 Metrics Comparison:
┌─────────────────┬──────────┬──────────┬────────────┐
│ Metric          │ Before   │ After    │ Improvement│
├─────────────────┼──────────┼──────────┼────────────┤
│ Response Time   │ X ms     │ Y ms     │ -Z%        │
│ Memory Usage    │ X MB     │ Y MB     │ -Z%        │
│ CPU Usage       │ X%       │ Y%       │ -Z%        │
│ Bundle Size     │ X KB     │ Y KB     │ -Z%        │
│ Cache Hit Rate  │ X%       │ Y%       │ +Z%        │
│ Query Time      │ X ms     │ Y ms     │ -Z%        │
└─────────────────┴──────────┴──────────┴────────────┘
```

### Bottlenecks Identified
1. **Critical**: [List critical bottlenecks found]
2. **Major**: [List major performance issues]
3. **Minor**: [List minor optimization opportunities]

### Optimizations Applied
✅ Database indexes added: [count]
✅ Queries optimized: [count]
✅ Components memoized: [count]
✅ Bundle size reduced: [amount]
✅ Caching implemented: [areas]
✅ Code refactored: [files]

### Recommendations
1. **Immediate Actions**:
   - Monitor performance metrics for next 24 hours
   - Run full test suite to ensure no regressions
   - Deploy to staging for user testing

2. **Short-term Improvements**:
   - Implement remaining quick wins
   - Set up performance monitoring dashboard
   - Create performance budget

3. **Long-term Strategy**:
   - Consider architectural improvements
   - Evaluate alternative technologies
   - Plan for scaling requirements

### Monitoring Setup
```bash
# Add these metrics to monitoring:
- API response time P50, P95, P99
- Database query execution time
- Frontend Core Web Vitals
- Memory usage trends
- Cache hit/miss ratio
```

### Next Steps
- Deploy optimizations to staging: `/deploy --staging`
- Run comprehensive tests: `/test all`
- Monitor performance metrics for 24 hours
- Document optimization patterns in wiki
- Schedule follow-up optimization review
