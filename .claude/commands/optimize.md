---
argument-hint: [component/service name or performance issue description]
description: Comprehensive performance optimization with bottleneck analysis and implementation
---

# Performance Optimization and Bottleneck Resolution

## Performance Context
**Target for optimization:** $ARGUMENTS

## System Performance Baseline

### Current System Metrics
!`docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" | head -15`

### Database Query Performance
!`docker exec spheroseg-backend npm run db:analyze 2>&1 | head -30 || echo "Database analysis not available"`

### Frontend Bundle Analysis
!`cd /home/cvat/cell-segmentation-hub && npm run analyze 2>&1 | head -20 || echo "Bundle analysis not available"`

### Network Performance
!`docker exec spheroseg-backend curl -w "@-" -o /dev/null -s "http://localhost:3001/health" <<< "time_namelookup:  %{time_namelookup}\ntime_connect:  %{time_connect}\ntime_appconnect:  %{time_appconnect}\ntime_pretransfer:  %{time_pretransfer}\ntime_redirect:  %{time_redirect}\ntime_starttransfer:  %{time_starttransfer}\ntime_total:  %{time_total}\n" 2>&1 || echo "Network timing not available"`

### Memory Usage Analysis
!`docker exec spheroseg-backend node -e "console.log(process.memoryUsage())" 2>&1 || echo "Memory usage not available"`
!`docker exec spheroseg-ml python -c "import psutil; print(f'Memory: {psutil.virtual_memory()}')" 2>&1 || echo "ML memory not available"`

### Recent Error Patterns
!`docker logs spheroseg-backend --tail 100 2>&1 | grep -E "error|Error|ERROR|slow|timeout" | tail -10 || echo "No recent errors"`

### Cache Status
!`docker exec spheroseg-redis redis-cli INFO stats 2>&1 | grep -E "keyspace_hits|keyspace_misses|evicted_keys" || echo "Redis stats not available"`

## Your Mission

You are an expert performance engineer specializing in full-stack optimization. Your goal is to systematically identify bottlenecks and implement optimizations using a sophisticated two-phase approach.

---

# PHASE 1: COMPREHENSIVE BOTTLENECK ANALYSIS
**Objective**: Deploy specialized agents in parallel to identify all performance bottlenecks

## Step 1: Initial Performance Assessment
Use the TodoWrite tool to create a task list for optimization phases, then analyze the metrics above to determine optimization targets.

## Step 2: Deploy Performance Analysis Agents (IN PARALLEL)

**CRITICAL**: Launch ALL relevant agents simultaneously for comprehensive analysis:

### Core Analysis Agents:
- **context-gatherer**: Gather comprehensive context about the optimization target
- **performance-debugger**: Analyze slow queries, memory leaks, CPU usage, bottlenecks
- **ssot-analyzer**: Identify code duplication and inefficient patterns

### Specialized Analysis Agents (deploy based on target):
- **frontend-debugger**: For React rendering, bundle size, component re-renders
- **backend-debugger**: For API response times, database queries, middleware overhead
- **ml-debugger**: For model inference time, GPU utilization, memory usage
- **docker-debugger**: For container resource limits, networking overhead
- **websocket-debugger**: For real-time communication latency
- **integration-mapper**: For identifying all integration points affecting performance

**Example parallel analysis for full-stack optimization:**

CRITICAL: Provide VERY detailed descriptions to each agent:
1. context-gatherer: "Analyze all components related to [target] for performance impact"
2. performance-debugger: "Identify bottlenecks in [target]: slow queries, memory leaks, CPU spikes"
3. frontend-debugger: "Analyze React performance for [target]: re-renders, bundle size, lazy loading"
4. backend-debugger: "Check API and database performance for [target]: N+1 queries, missing indexes"
5. ssot-analyzer: "Find duplicate code and inefficient patterns in [target]"

## Step 3: Serena Memories Query

MANDATORY: Read Serena memories for optimization strategies:
1. Search for similar performance issues and solutions
2. Query for optimization patterns and best practices
3. Look for caching strategies and performance improvements
4. Find database optimization techniques

## Step 4: Consolidate Performance Findings

1. Review all agent reports and Serena memories insights
2. Identify primary bottlenecks (Pareto principle - 80/20 rule)
3. Map performance impact across components
4. Prioritize optimizations by impact/effort ratio

---

# PHASE 2: SOPHISTICATED OPTIMIZATION IMPLEMENTATION
**Objective**: Implement optimizations systematically using specialized agents

## Step 1: Optimization Strategy Design

Based on Phase 1 findings, design optimizations that:
- Target the highest-impact bottlenecks first
- Minimize code changes while maximizing performance gains
- Implement caching where appropriate
- Optimize database queries and indexes
- Reduce bundle sizes and network requests
- Improve algorithmic complexity

## Step 2: Deploy Implementation Agents (IN PARALLEL)

### Primary Implementation Agents:
- **feature-implementor**: Implement comprehensive optimizations across the stack
  - Provide detailed optimization plan from Phase 1
  - Include all performance improvements identified
  - Specify caching strategies and optimizations

### Supporting Implementation Agents:
- **test-generator**: Create performance tests and benchmarks
- **integration-mapper**: Ensure optimizations don't break integrations
- **cleanup-analyzer**: Identify and remove unnecessary code/dependencies

**Example parallel implementation:**
```
Use Task tool with:
1. test-generator: "Write performance benchmarks for [optimization target]..."
2. feature-implementor: "Implement optimizations: [list specific optimizations]..."
3. cleanup-analyzer: "Remove unused dependencies and dead code in [target]..."
```

## Step 3: Performance Verification

### Measure Improvements:
1. **Response Time**: API endpoint latency reduction
2. **Memory Usage**: Heap size and garbage collection frequency
3. **CPU Usage**: Processing time reduction
4. **Bundle Size**: Frontend asset size reduction
5. **Database Performance**: Query execution time improvement
6. **Cache Hit Rate**: Redis/memory cache effectiveness

### Verification Commands:
!`docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -10`
!`docker exec spheroseg-backend npm run performance:test 2>&1 || echo "Performance tests not configured"`

## Step 4: Knowledge Storage

Store optimization patterns in Serena memories:
1. Document the bottleneck patterns identified
2. Explain optimization techniques applied
3. Record performance improvements achieved
4. Include code patterns for future reference
5. List monitoring strategies for sustained performance

---

## Critical Optimization Guidelines

### Phase 1 - Analysis:
1. **Parallel Analysis**: Always deploy multiple agents simultaneously
2. **Comprehensive Metrics**: Gather performance data from all layers
3. **Root Cause Focus**: Identify underlying issues, not just symptoms
4. **Impact Assessment**: Quantify performance impact of each bottleneck
5. **Knowledge Leverage**: Search Serena memories for proven solutions

### Phase 2 - Implementation:
1. **Incremental Optimization**: Start with quick wins, then deeper optimizations
2. **Measure Everything**: Benchmark before and after each optimization
3. **Cache Strategically**: Implement caching at appropriate layers
4. **Optimize Algorithms**: Improve time/space complexity where possible
5. **Bundle Optimization**: Reduce, split, and lazy-load frontend assets

### Performance Optimization Techniques:

#### Frontend Optimizations:
- React.memo and useMemo for expensive computations
- Code splitting and lazy loading
- Image optimization and lazy loading
- Virtual scrolling for large lists
- Service worker caching
- Bundle size reduction

#### Backend Optimizations:
- Database query optimization and indexing
- API response caching with Redis
- Connection pooling
- Async/await optimization
- Memory leak prevention
- Request batching

#### Infrastructure Optimizations:
- Docker container resource tuning
- Nginx caching and compression
- CDN implementation
- Load balancing strategies
- Database connection pooling
- Monitoring and alerting

## Expected Deliverables

### After Phase 1 (Analysis):
1. **Bottleneck Map**: Complete list of performance issues
2. **Impact Analysis**: Quantified impact of each bottleneck
3. **Root Cause Report**: Underlying causes of performance issues
4. **Optimization Opportunities**: Prioritized list of improvements
5. **Benchmark Baseline**: Current performance metrics

### After Phase 2 (Implementation):
1. **Implementation Summary**: All optimizations applied
2. **Performance Gains**: Measured improvements with metrics
3. **Test Coverage**: Performance tests and benchmarks
4. **Monitoring Setup**: Ongoing performance tracking
5. **Knowledge Entry**: Stored patterns and solutions

## Execution Flow Summary

```
1. Receive optimization target → Create Todo List
2. Launch Analysis Agents (parallel) → Identify Bottlenecks
3. Query Serena memories → Find Proven Solutions
4. Design Optimizations → Prioritize by Impact
5. Launch Implementation Agents (parallel) → Apply Optimizations
6. Verify Performance → Measure Improvements
7. Store Knowledge → Document Solutions
```

## Common Optimization Patterns

### Database Optimizations:
- Add missing indexes
- Optimize N+1 queries
- Implement query result caching
- Use database views for complex queries
- Optimize JOIN operations

### API Optimizations:
- Implement response caching
- Add pagination for large datasets
- Use compression (gzip/brotli)
- Optimize serialization
- Implement request batching

### Frontend Optimizations:
- Implement virtual scrolling
- Use intersection observer for lazy loading
- Optimize re-renders with memo
- Split code by routes
- Optimize images and assets

### Caching Strategies:
- Browser cache with service workers
- CDN caching for static assets
- Redis for API responses
- Memory cache for computed values
- Database query caching

**Remember**: Performance optimization is iterative. Focus on measuring impact and delivering incremental improvements that compound over time!
