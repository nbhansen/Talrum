---
type: Reference
title: Operations & Quality Verification
description: Overview of Talrum's operational procedures, testing strategy, and continuous integration checks.
tags: [operations, testing, ci, runbooks]
---

# Operations & Quality Verification

Talrum's operations and testing strategy relies on a mix of local unit testing, database verification, and CI/CD pipelines to ensure stability without complex deployments.

## Testing Strategy

The test suite is divided into several domains:

1. **Frontend Unit and Integration Tests**: Standard JavaScript testing frameworks verify UI components, state management (such as the outbox queue in the [Offline Synchronization Model](offline-sync.md)), and utility functions across the [Architecture Overview](architecture.md) boundaries. To prevent regressions in critical workflows, test coverage for the optimistic core, persistence layers, and media handling pipelines is explicitly gated in the continuous integration pipeline.
2. **Database Testing**: The PostgreSQL schema, row-level security (RLS) policies, and triggers are tested directly in the database using database-native testing tools.
3. **Edge Functions**: Backend business logic, such as the account deletion flow, is executed in isolated runtime environments and verified via integration test scripts.
4. **Build Verification**: Post-build scripts run to verify production artifacts, including a check that ensures CSS bundles meet architectural requirements.

The specific commands for running these suites can be found in the repository configuration.

## Operational Procedures

Operational tasks, such as handling GDPR-compliant account deletion requests, are documented in dedicated runbooks located in the `docs/runbooks/` directory.

The application prefers automated, self-serve paths for destructive operations. For example, the in-app account deletion flow triggers an edge function that automatically cleans up all associated storage objects and cascading database records. The runbooks provide fallback manual procedures for edge cases where the automated system cannot be used.
