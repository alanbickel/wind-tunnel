# Profile: RDS

What RDS exposes and enforces, and what the type starts with ([a service's profile](../profile-spec.md)). This profile hasn't been researched yet: it holds only the type's defaults. Where the model differs from AWS is in its [fidelity entries](rds-fidelity.md).

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| RDS | `maxConnections` | 90 | Assumption; documented formula in RDS-1 |
| RDS | `queryWorkers` | 16 | Assumption (RDS-2) |
| RDS | `queryTime` | median 15 ms, p99 60 ms | Assumption (workload-specific) |
