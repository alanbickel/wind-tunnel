# Fidelity: Lambda

Where Wind Tunnel's model of Lambda differs from AWS. How to read an entry, and the differences that matter most, are on the [fidelity index](../../fidelity.md). Its settings and defaults are in its [profile](lambda-profile.md).

#### LMB-1: Concurrency is per function, not shared by the account

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Account groups (M8 items 13 and 14); it's M8 item 15.
- **Checked:** 2026-10-14
- **Wind Tunnel:** each Lambda component has its own `concurrency` limit (default 1,000).
- **AWS:** by default an account has 1,000 concurrent executions per Region, shared by all functions. Reserved concurrency sets aside part of the pool for one function, and caps it. Up to 900 can be reserved, because 100 always stay unreserved.
- **Evidence:** Documented: [Lambda concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html).
- **Skew:** Optimistic for projects with several functions: Template B's two functions get 1,000 each in the model, but would share 1,000 in AWS.
- **To close:** an account-level pool, with an optional reserved concurrency per function. The request rate (10 × concurrency, LMB-10) follows concurrency to whichever level holds it: AWS enforces it for the account and for each function with reserved concurrency.

#### LMB-2: Lambda scales out instantly

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** a function can go from 0 to its full concurrency at once.
- **AWS:** each function can add at most 1,000 execution environments every 10 seconds (or 10,000 requests per second every 10 seconds). The same page also says on-demand concurrency "can experience a burst increase of 500 concurrency every 10 seconds", which seems to conflict; we follow the bolded 1,000 figure.
- **Evidence:** Documented: [Lambda concurrency, scaling rate](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html).
- **Skew:** Optimistic for spikes that need more than about 1,000 new environments within 10 s. The MVP templates stay under that.
- **To close:** a token bucket on new environments.

#### LMB-4: Every finished invocation leaves a warm environment

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** ENG-5's Lambda timeout; it's part of M8 item 21.
- **Checked:** 2026-10-14
- **Wind Tunnel:** any invocation, successful or failed, leaves a warm environment behind.
- **AWS:** if a function crashes or times out during an invocation, Lambda resets the environment, and the next invocation in it pays the initialization again (a "suppressed init"). We assume a function that returns an error normally (without crashing) keeps its environment.
- **Evidence:** Documented for crashes and timeouts: [execution environment lifecycle, failures during the invoke phase](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html). Assumption for handled errors.
- **Skew:** Optimistic during failure storms with timeouts: AWS pays more cold starts.
- **To close:** depends on ENG-5. Once functions can time out, a timed-out environment should go cold.

#### LMB-5: How long an environment stays warm

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** an environment idle for `idleTimeoutSec` (default 600 s) goes cold; otherwise it stays warm forever.
- **AWS:** Lambda "retains the execution environment for a period of time" but doesn't say how long. It also "terminates execution environments every few hours" for maintenance, even for functions invoked continuously, and may sometimes initialize environments ahead of requests.
- **Evidence:** Documented that retention is unspecified, and the periodic recycling: [execution environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html). Observed: the 5 to 15 minute idle lifetime comes from community measurements, not AWS.
- **Skew:** Minor for runs of minutes.

#### LMB-6: Cold start time doesn't depend on the function

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** A source for typical cold starts by runtime. Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** cold starts are drawn from one distribution (default median 300 ms, p99 1 s), the same for every function. The environment is busy during initialization, which counts against concurrency (as in AWS).
- **AWS:** "The duration of a cold start varies from under 100 ms to over 1 second", depending on runtime, package size, and initialization code. Initialization is limited to 10 s.
- **Evidence:** Documented range: [execution environment lifecycle, cold starts](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html). Our specific numbers are an assumption inside that range.
- **Skew:** Mixed.
- **To close:** presets by runtime, once there's a source for typical values.

#### LMB-7: Memory size isn't modeled

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** compute time is a fixed distribution.
- **AWS:** "Any increase in memory size triggers an equivalent increase in CPU available to your function", so CPU-bound functions get faster with more memory.
- **Evidence:** Documented: [Lambda best practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html).
- **Skew:** Minor for the MVP. It matters for cost and tuning features.

#### LMB-8: RDS connections are held per invocation, not per environment

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Components that know about each other's execution environments; it's M8 item 26.
- **Checked:** 2026-10-14
- **Wind Tunnel:** an invocation takes an RDS connection when its query arrives and gives it back when the query finishes.
- **AWS:** the recommended pattern is to open database connections outside the handler, so they're reused by later invocations in the same environment. Each warm environment then holds its connection while idle, so connections in use ≈ execution environments, not running queries.
- **Evidence:** Documented: [Lambda best practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html), [execution environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) ("instead of reestablishing the connection, the original connection is used in subsequent invocations").
- **Skew:** **Optimistic.** Real Lambda → RDS runs out of connections at lower load, and stays out after a spike while environments are warm. Template A's lesson is stronger in AWS than in the model.
- **To close:** connections held by Lambda environments, released when an environment goes cold. This needs components to know about each other's environments, so it's a design change.

#### LMB-9: No provisioned concurrency or SnapStart

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-10-14
- **Wind Tunnel:** every environment starts cold.
- **AWS:** provisioned concurrency keeps environments initialized ahead of time; SnapStart restores them from a snapshot.
- **Evidence:** Documented: [Lambda concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html).
- **Skew:** none until a template wants to show the fix for cold starts.

#### LMB-10: Lambda's request rate holds one second of invocations, and is checked after concurrency

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-20
- **Wind Tunnel:** a function's request rate, 10 × `concurrency` invocations a second (10,000 at the default 1,000), is a token bucket that holds one second of invocations and starts full. There's no burst setting. An invocation is refused at `concurrency` if every slot is taken, and otherwise at `requestRate` if the bucket is empty; neither limit is spent on an invocation the other refuses. So `concurrency: 0` refuses every invocation at `concurrency`.
- **AWS:** limits requests per second to 10 × the concurrency, for the account and for a function's reserved concurrency, and throttles with `429 TooManyRequestsException` over either limit. It doesn't say how requests are counted within the second, whether a quiet function can take a burst over the rate, or which limit it checks first.
- **Evidence:** Documented for the rate: [Lambda concurrency, concurrency vs. requests per second](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html#concurrency-vs-requests-per-second). Assumption for the burst, the starting level, and the order.
- **Skew:** Mixed. A bucket smaller than Lambda's lets fewer invocations through a sudden spike; a larger one, more. The order changes only which limit a refusal is put down to when both are full.
- **To close:** evidence of how Lambda counts a second's requests.
