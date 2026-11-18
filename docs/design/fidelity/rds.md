# Fidelity: RDS

Where Wind Tunnel's model of RDS differs from AWS. How to read an entry, and the differences that matter most, are on the [fidelity index](../fidelity.md).

#### RDS-1: The default connection limit isn't tied to an instance size

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** `maxConnections` defaults to 90.
- **AWS:** the default `max_connections` depends on engine and memory: about memory in MB ÷ 12 for MySQL, and memory ÷ 9,531,392 bytes (capped at 5,000) for PostgreSQL, after memory reserved for the operating system. A MySQL db.t3.micro allows about 60.
- **Evidence:** Documented: [RDS maximum connections](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html#RDS_Limits.MaxConnections). Assumption: 90 as a representative small instance.
- **Skew:** depends on the instance being imitated.
- **To close:** choose an engine and instance class, and derive the limit.

#### RDS-2: Database capacity is a fixed pool of query workers

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** ENG-6; both are M10 item 1.
- **Checked:** 2026-10-14
- **Wind Tunnel:** `queryWorkers` (default 16) queries run at once; extra queries wait in a first-in, first-out line, holding their connection. Throughput stays flat at the workers' capacity however long the line gets.
- **AWS:** databases have no such fixed pool. Capacity is shared CPU, I/O, memory, and locks, and throughput often *falls* past saturation, as contention and context switching grow.
- **Evidence:** Assumption (an abstraction).
- **Skew:** Optimistic under overload: the model plateaus where a real database may degrade.
- **To close:** service time that grows with the number of running queries (ENG-6).

#### RDS-3: Connections are held only while a query runs or waits

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** LMB-8 (M8 item 26).
- **Checked:** 2026-10-14

See [LMB-8](lambda.md#lmb-8-rds-connections-are-held-per-invocation-not-per-environment).

#### RDS-4: Opening a connection is free

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** LMB-8; both are M8 item 26.
- **Checked:** 2026-10-14
- **Wind Tunnel:** getting a connection takes no time and no database capacity.
- **AWS:** opening a connection takes network round trips, TLS, and authentication, and uses database CPU and memory ("Database connections consume memory"). A burst of new Lambda environments opening connections adds load just as the database is busiest.
- **Evidence:** Documented that connections consume memory, and RDS Proxy is recommended when apps "frequently open and close connections": [RDS maximum connections](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html#RDS_Limits.MaxConnections). Assumption: the time cost.
- **Skew:** Optimistic during scale-out.
- **To close:** a connect cost on the first query from each new environment, once LMB-8 is modeled.

#### RDS-5: Refused connections fail instantly

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** with every connection in use, a request is rejected at once with `too-many-connections`.
- **AWS:** the engine refuses the connection (MySQL's "Too many connections" error, PostgreSQL's "too many clients"). The time to fail and whether drivers or pools retry depends on the client.
- **Evidence:** Assumption (engine behavior, not AWS-specific).
- **Skew:** Minor.

#### RDS-6: No RDS Proxy, read replicas, or Multi-AZ

- **Status:** Open
- **Kind:** Setting
- **Depends on:** LMB-8 for RDS Proxy, which is M8 item 27. Read replicas and Multi-AZ have no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** a single database instance.
- **AWS:** RDS Proxy pools connections and is recommended when applications open many connections, as Lambda does.
- **Evidence:** Documented: [RDS maximum connections](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html#RDS_Limits.MaxConnections).
- **Skew:** none until a template wants to show the fix for Template A.

## Default values and their evidence

| Component | Setting | Default | Evidence |
|---|---|---|---|
| RDS | `maxConnections` | 90 | Assumption; documented formula in RDS-1 |
| RDS | `queryWorkers` | 16 | Assumption (RDS-2) |
| RDS | `queryTime` | median 15 ms, p99 60 ms | Assumption (workload-specific) |
