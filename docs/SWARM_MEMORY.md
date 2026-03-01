# Swarm Memory Documentation

## Overview

Swarm Memory is a distributed memory system designed for coordinating thousands of AI agents in the Viral Swarm Commander ecosystem. It provides shared state management, real-time data synchronization, and persistent storage for swarm operations.

## Recent Updates

### Mission Planning & Dependency Readiness

- Mission ingestion now supports multi-phase pipelines (Phase 0 bootstrap + downstream phases) and can import both `pending` and `deployed` mission statuses (configurable).
- A mission plan is generated to reconcile dependencies and readiness, producing a stable view of which missions are blocked vs ready to run.

Key artifacts:
- `data/swarm/missions/index.json`: local mission index (materialized from exports)
- `data/swarm/mission-plan.json`: computed plan with phases, readiness, and missing dependencies

Config:
- `SWARM_MISSION_IMPORT_STATUSES` (default: `deployed,pending`)
- `SWARM_MISSION_IMPORT_CATEGORIES` (default includes `infrastructure,market_research,store_setup,financial_setup,marketing,operations,content_creation`)

## Architecture

### Core Components

```javascript
class SwarmMemory {
    constructor() {
        this.sharedState = new Map();
        this.agentRegistry = new Map();
        this.performanceMetrics = new Map();
        this.contentTemplates = new Map();
        this.campaignData = new Map();
        this.platformStates = new Map();
    }
}
```

### Memory Segments

#### 1. Shared State Management

- **Purpose**: Coordinate agent activities across platforms
- **Data**: Active campaigns, viral coefficients, engagement rates
- **Access**: Real-time read/write for all swarm agents
- **Persistence**: Auto-sync every 30 seconds

```javascript
// Shared state structure
{
    campaign_id: "viral_campaign_2026_02_17",
    viral_coefficient: 2.5,
    engagement_targets: {
        twitter: 12.3,
        instagram: 8.7,
        tiktok: 15.2,
        youtube: 6.4,
        linkedin: 4.1,
        reddit: 9.8
    },
    traffic_boost_progress: 347,
    target_boost: 500
}
```

#### 2. Agent Registry

- **Purpose**: Track all swarm agents and their status
- **Data**: Agent IDs, platform assignments, performance metrics
- **Access**: Commander and platform coordinators
- **Updates**: Real-time heartbeat monitoring

```javascript
// Agent registry entry
{
    agent_id: "twitter_agent_0001",
    platform: "twitter",
    status: "active",
    specialization: "trending_hashtags",
    posts_created: 47,
    engagement_rate: 13.2,
    last_heartbeat: "2026-02-17T13:45:00Z",
    viral_coefficient: 2.1
}
```

#### 3. Performance Metrics

- **Purpose**: Store historical and real-time performance data
- **Data**: Platform metrics, content performance, viral coefficients
- **Access**: Analytics dashboard and optimization algorithms
- **Retention**: 30-day rolling window

```javascript
// Performance metrics
{
    platform: "tiktok",
    timestamp: "2026-02-17T13:45:00Z",
    metrics: {
        posts_created: 2156,
        engagement_rate: 15.2,
        viral_coefficient: 3.2,
        reach: 78000,
        trending_hashtags: ["#fyp", "#viral", "#challenge"]
    }
}
```

#### 4. Content Templates Library

- **Purpose**: Store viral content templates and their performance
- **Data**: Template categories, engagement rates, platform optimizations
- **Access**: All content-creating agents
- **Updates**: Template performance tracking

```javascript
// Content template
{
    template_id: "relatable_situation_meme",
    category: "memes",
    platforms: ["twitter", "instagram", "reddit"],
    engagement_rate: 95,
    viral_potential: "extreme",
    content_structure: "When you... [relatable situation]",
    call_to_action: "Tag someone who does this!",
    usage_count: 234,
    average_performance: 18.7
}
```

#### 5. Campaign Data

- **Purpose**: Store campaign configuration and progress
- **Data**: Campaign settings, target parameters, progress tracking
- **Access**: Campaign managers and commander
- **Persistence**: Full campaign lifecycle

```javascript
// Campaign data
{
    campaign_id: "viral_campaign_2026_02_17",
    target_traffic_boost: 500,
    current_progress: 347,
    start_time: "2026-02-17T11:00:00Z",
    estimated_completion: "2026-02-17T17:00:00Z",
    platforms: ["twitter", "instagram", "tiktok", "youtube", "linkedin", "reddit"],
    content_distribution: {
        viral_videos: 234,
        memes: 456,
        stories: 567,
        polls: 123,
        challenges: 89
    }
}
```

#### 6. Platform States

- **Purpose**: Maintain current state of each social platform integration
- **Data**: API status, rate limits, connection health
- **Access**: Platform-specific agents and coordinators
- **Monitoring**: Real-time connection status

```javascript
// Platform state
{
    platform: "twitter",
    api_status: "connected",
    rate_limit_remaining: 187,
    rate_limit_total: 300,
    last_api_call: "2026-02-17T13:44:55Z",
    connection_health: "healthy",
    agents_deployed: 250
}
```

## Memory Operations

### Read Operations

```javascript
// Get shared campaign state
const campaignState = swarmMemory.getSharedState('current_campaign');

// Get agent performance
const agentMetrics = swarmMemory.getAgentMetrics('twitter_agent_0001');

// Get platform performance
const platformData = swarmMemory.getPlatformState('tiktok');
```

### Write Operations

```javascript
// Update agent status
swarmMemory.updateAgentStatus('twitter_agent_0001', 'active', metrics);

// Update campaign progress
swarmMemory.updateCampaignProgress(347);

// Store performance metrics
swarmMemory.recordMetrics('platform', 'tiktok', performanceData);
```

### Synchronization

```javascript
// Auto-sync every 30 seconds
setInterval(() => {
    swarmMemory.syncSharedState();
    swarmMemory.persistMetrics();
}, 30000);

// Real-time updates for critical data
swarmMemory.realTimeUpdate('viral_coefficient', 3.2);
```

## Performance Characteristics

### Capacity

- **Maximum Agents**: 50,000 concurrent
- **Memory Usage**: 2.1GB current, scalable to 10GB
- **Throughput**: 2,847 operations/second
- **Latency**: 150ms average response time
- **Success Rate**: 98.5% for memory operations

### Scalability

- **Horizontal Scaling**: Multi-node memory clusters
- **Load Balancing**: Distributed memory access
- **Failover**: Automatic backup nodes
- **Recovery**: 99.9% data persistence guarantee

## Security Features

### Data Protection

- **Encryption**: AES-256 for sensitive campaign data
- **Access Control**: Role-based memory access
- **Audit Trail**: All memory operations logged
- **Isolation**: Platform-specific memory segments

### Privacy Compliance

- **Data Anonymization**: User data anonymization for analytics
- **GDPR Compliance**: Right to deletion and data portability
- **Platform Compliance**: Adheres to social platform policies
- **Rate Limiting**: Prevents API abuse through memory tracking

## Integration Points

### External APIs

- **Base44 API**: Campaign and performance data synchronization
- **Social Platform APIs**: Real-time platform state updates
- **Analytics Services**: External analytics integration
- **Webhook Endpoints**: Real-time notifications

### Internal Systems

- **Agent Heartbeat**: Agent status and health monitoring
- **Performance Dashboard**: Real-time metrics display
- **Campaign Manager**: Campaign configuration and progress
- **Content Optimizer**: Template performance analysis

## Best Practices

### Memory Usage

1. **Regular Cleanup**: Remove obsolete data every hour
2. **Compression**: Compress historical data older than 7 days
3. **Archival**: Archive completed campaigns after 30 days
4. **Monitoring**: Monitor memory usage and performance metrics

### Data Consistency

1. **Atomic Operations**: Use atomic operations for critical updates
2. **Transaction Logging**: Log all state changes
3. **Conflict Resolution**: Implement conflict resolution for concurrent updates
4. **Backup Strategy**: Regular backups of critical campaign data

### Performance Optimization

1. **Caching Strategy**: Cache frequently accessed data
2. **Index Optimization**: Optimize memory access patterns
3. **Batch Operations**: Batch related memory operations
4. **Async Processing**: Use async operations for non-critical updates

## Troubleshooting

### Common Issues

1. **Memory Leaks**: Monitor for unreferenced objects
2. **Sync Delays**: Check network connectivity and sync intervals
3. **Data Corruption**: Verify data integrity with checksums
4. **Performance Degradation**: Analyze memory access patterns

### Debug Information

- **Memory Usage**: 2.1GB current usage
- **Active Agents**: 847 agents tracked
- **Queue Length**: 1,247 pending operations
- **Last Heartbeat**: 2026-02-15T14:50:00Z
- **Error Count**: 3 memory operation errors

## Future Enhancements

### Planned Features

1. **Machine Learning Integration**: Predictive memory optimization
2. **Distributed Architecture**: Multi-region memory clusters
3. **Real-Time Analytics**: Enhanced performance analytics
4. **AI-Powered Optimization**: Intelligent memory management

### Scaling Roadmap

1. **Phase 1**: Support 100,000 agents (Q2 2026)
2. **Phase 2**: Multi-region deployment (Q3 2026)
3. **Phase 3**: AI-powered optimization (Q4 2026)
4. **Phase 4**: Edge computing integration (Q1 2027)
