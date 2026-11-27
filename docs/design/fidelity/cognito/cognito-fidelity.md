# Fidelity: Cognito

Where Wind Tunnel's model of Amazon Cognito user pools differs from AWS. How to read an entry, and the differences that matter most, are on the [fidelity index](../../fidelity.md). Its settings and defaults are in its [profile](cognito-profile.md).

#### COG-1: The sign-in quota is per user pool, not shared by the account

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Account groups (M8 items 13 and 14); it's M8 item 15.
- **Checked:** 2026-11-26
- **Wind Tunnel:** each Cognito component has its own `userAuthenticationPerSec` (default 120).
- **AWS:** the `UserAuthentication` quota, 120 requests per second by default, is "pooled … across all user pools in one AWS Region in your account": "AWS measures the aggregate rate of all requests from all user pools". Raising it raises it for every pool in the Region, and is billed above the default.
- **Evidence:** Documented: [quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html).
- **Skew:** Optimistic for a project with several user pools in one account: two pools get 120 each in the model, but would share 120 in AWS.
- **To close:** an account-level limit that every Cognito component in the account group takes from.

#### COG-2: The rate's burst is one second of requests

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-26
- **Wind Tunnel:** the rate is a token bucket holding one second's requests (120), refilled at the rate, and it starts full. There's no burst setting.
- **AWS:** gives the quota as requests per second and doesn't say how requests are counted within the second, or whether a quiet account can take a burst over it.
- **Evidence:** Assumption.
- **Skew:** Mixed. A bucket smaller than Cognito's lets fewer requests through a sudden spike; a larger one, more.
- **To close:** evidence of how Cognito counts a second's requests.

#### COG-3: A sign-in is one request

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-26
- **Wind Tunnel:** a `sign-in` takes one token from the `UserAuthentication` rate, whatever the flow.
- **AWS:** a sign-in is `InitiateAuth` plus a `RespondToAuthChallenge` for each challenge. The default app client allows SRP, which always answers one challenge, and MFA adds one more. Challenge responses count against a quota of their own, three times `UserAuthentication`'s, and the responses over it count against `UserAuthentication`, so up to three challenges per sign-in cost nothing more. AWS's example: at four challenges per sign-in, 70 sign-ins a second use 110 of a quota of 80.
- **Evidence:** Documented: [quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html), [`CreateUserPoolClient`](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateUserPoolClient.html) (the default flows).
- **Skew:** Optimistic for a sign-in with more than three challenges, such as a custom auth flow; accurate for up to three. A sign-in's latency setting has to cover all its calls.
- **To close:** a challenge count on the step (a request setting), a second rate at three times the first, and the overflow rule, which the shared rate-limited base doesn't support.

#### COG-4: No limit per user

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** A user distribution on the workload, as DDB-3's key distribution would be. Nothing; no Roadmap item yet.
- **Checked:** 2026-11-26
- **Wind Tunnel:** any number of a workload's requests can be for the same user.
- **AWS:** besides each category's quota, Cognito limits the requests for one user to 10 a second for reads (`InitiateAuth`, `RespondToAuthChallenge`, `GetUser`, and others) and 10 for writes.
- **Evidence:** Documented: [quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html).
- **Skew:** Optimistic for a workload that signs in the same user over and over, such as a load test with one test account. Minor for real traffic, spread over many users.
- **To close:** a user distribution on the workload, and a rate per user.

#### COG-5: Sign-in and refresh take an assumed time

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Evidence of Cognito's service time, which AWS doesn't publish. Nothing; no Roadmap item yet.
- **Checked:** 2026-11-26
- **Wind Tunnel:** each sign-in and refresh takes a time drawn from its action's latency setting, whatever the flow and the feature plan.
- **AWS:** doesn't publish a latency. One user measured 200–300 ms a call from Lambda, after a first call of 2–3 s. SRP's challenge is a second round trip; threat protection, on the Plus plan, checks each sign-in for risk; and Lambda triggers run inside the sign-in (COG-6).
- **Evidence:** Observed: [aws-sdk-js issue 3419](https://github.com/aws/aws-sdk-js/issues/3419) (2020, one user). Assumption: the defaults, and a refresh taking less than a sign-in.
- **Skew:** Mixed: unknown either way.
- **To close:** published or measured latencies, for each flow.

#### COG-6: Lambda triggers aren't called

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Nothing in the engine: a sign-in would call a Lambda component as a step's call does. No Roadmap item yet.
- **Checked:** 2026-11-26
- **Wind Tunnel:** a sign-in or refresh calls nothing.
- **AWS:** a user pool can call Lambda functions during sign-in and refresh (pre and post authentication, pre token generation, the custom challenge triggers, and others). Cognito invokes them synchronously and waits up to 5 seconds, a limit you can't change; a trigger that fails or times out fails the sign-in. The functions share the account's Lambda concurrency.
- **Evidence:** Documented: [Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-working-with-lambda-triggers.html).
- **Skew:** Optimistic for a pool with triggers: a sign-in takes the trigger's time too, and fails when the trigger is throttled or slow.
- **To close:** a user can model a trigger today as a Lambda step after the sign-in step. Modeling it inside the sign-in needs a call the component makes, with the 5 s timeout.

#### COG-7: Token lifetimes aren't settings

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-26
- **Wind Tunnel:** the component has no token lifetimes. How often a workload refreshes is up to how often its steps call `refresh`.
- **AWS:** an app client sets how long access and ID tokens last (1 hour by default, 5 minutes to 1 day) and refresh tokens (30 days by default, 60 minutes to 10 years). A client refreshes about once per access token lifetime while a user is active, so shorter tokens mean more refreshes against the same quota. AWS's own sizing example: one million sign-ins in eight hours, with two-hour sessions and one-hour tokens, needs 70 requests a second, twice the sign-in rate.
- **Evidence:** Documented: [`CreateUserPoolClient`](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateUserPoolClient.html), [access token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html), [quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html).
- **Skew:** Minor: a workload sets its refresh rate directly.
- **To close:** a refresh rate derived from a token lifetime and session length on the workload, if templates need it.

#### COG-8: Only sign-in and refresh

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-26
- **Wind Tunnel:** the type takes only `sign-in` and `refresh`.
- **AWS:** each other category of the user pools API has its own quota per account and Region: `UserCreation` (sign-up and confirmation) 50 a second, `UserRead` (`GetUser`) 120, `UserAccountRecovery` 30, `UserFederation` 25, `ClientAuthentication` (machine-to-machine tokens) 150, and more, several not raisable. A managed login domain takes 500 requests a second, and 300 from one IP address.
- **Evidence:** Documented: [quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html).
- **Skew:** Optimistic for a design whose busiest path isn't sign-in: a launch that signs up users meets `UserCreation`'s 50 a second first, and an app that calls `GetUser` on each request meets `UserRead`'s.
- **To close:** an action and a limit for each category a template needs, on the same base.
