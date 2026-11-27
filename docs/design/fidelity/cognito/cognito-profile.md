# Profile: Cognito

What Amazon Cognito user pools expose and enforce, researched before the type's code ([a service's profile](../profile-spec.md)). Where the model differs from AWS is in its [fidelity entries](cognito-fidelity.md).

- **Checked:** 2026-11-26
- **The model, in one line:** a component is one user pool. Sign-ins and token refreshes take from one rate, the `UserAuthentication` quota; a request over it is refused as `TooManyRequestsException`, and the rest are served after a latency drawn for the action.
- **Model choices:**
  - **Only sign-in and refresh reach the pool.** A token is checked against the pool's public keys, "without sending API requests to a user pool", as AWS advises. An HTTP API's JWT authorizer does so, with the keys cached for up to two hours (Documented); a REST API's Cognito authorizer, we assume, does the same. So a request that carries a token isn't a call to this component; only getting a token is. Item 17 of the Roadmap builds authorizers.
  - **One rate for both actions.** AWS counts sign-in and token refresh against the same `UserAuthentication` quota, so the type has one limit that both actions take from, as S3's `GET` and `LIST` share one.
  - **A sign-in is one request.** The default app client signs in with SRP, which takes two calls (`InitiateAuth`, then `RespondToAuthChallenge`), and MFA adds one more. The challenge responses count against a quota of their own, three times `UserAuthentication`'s, so one challenge per sign-in, or two, never reaches it. The type counts each sign-in once and leaves challenge responses out (COG-3).
  - **The quota is per component.** AWS shares it among every user pool in the account and Region. Until account-level limits exist (Roadmap item 15), each component has its own, as Lambda's concurrency is (COG-1).
  - **A burst of one second's requests.** AWS gives the quota per second and doesn't say how requests are counted within the second, so the rate is a token bucket that holds one second of requests, with no burst setting (COG-2).
  - **Assumed latencies.** AWS doesn't publish how long a sign-in or a refresh takes, so the defaults are assumptions (COG-5).
- **Shape:** a rate-limited request/response service, on the shared base (`rate-limited-service.ts`), as S3 is: one limit, two actions that take from it, each with its own latency setting, and one rejection reason. It needs nothing the base lacks.

## Actions

| Wind Tunnel action | Cognito requests | Rate it counts against | Evidence |
|---|---|---|---|
| `sign-in` | `InitiateAuth`, `AdminInitiateAuth` (password, SRP, custom, or choice-based flows) | `UserAuthentication`, 120 per second | Documented ([quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html)) |
| `sign-in` | `RespondToAuthChallenge`, `AdminRespondToAuthChallenge` | A separate quota, 3 × `UserAuthentication`; responses over it count against `UserAuthentication` | Documented ([quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html)); not modeled (COG-3) |
| `refresh` | `InitiateAuth` or `AdminInitiateAuth` with `REFRESH_TOKEN_AUTH`, `GetTokensFromRefreshToken`, or the token endpoint's `refresh_token` grant | `UserAuthentication`, the same 120 | Documented ([quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html), [refresh tokens](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html)) |

Steps take only `invoke`, `read`, `write`, and `enqueue` today (`StepAction`, and the project document's schema), so the type adds `sign-in` and `refresh` to both. That's a change to the domain model, not to the engine.

## Settings

Settings AWS exposes that could change how the pool behaves under load. Sign-up, password reset, user and group management, federation, managed login, identity pools, and MFA aren't on the path this type models (COG-8).

| Setting | AWS default | Range | Modeled |
|---|---|---|---|
| `UserAuthentication` provisioned limit | 120 per second | Up to the account-level maximum that Service Quotas approves; paid for above 120 | Yes, as `userAuthenticationPerSec`, per component (COG-1) |
| Feature plan | Essentials, for a new pool | Lite, Essentials, Plus | No: it doesn't change the quotas; Plus's threat protection checks each sign-in, at an unknown cost in time (COG-5) |
| Authentication flows the app client allows | SRP, refresh token, and custom auth | Password, SRP, custom, choice-based (Essentials and up), refresh token | No: every sign-in is one request (COG-3) |
| Lambda triggers | None | Pre and post authentication, pre token generation, the custom challenge triggers, and others | No (COG-6) |
| Access and ID token validity | 1 hour | 5 minutes to 1 day | No: how often a workload refreshes is up to its steps (COG-7) |
| Refresh token validity | 30 days | 60 minutes to 10 years | No (COG-7) |
| Refresh token rotation | Off | On or off; on needs `GetTokensFromRefreshToken` or the token endpoint | No: a refresh counts the same either way |

Evidence: Documented: [quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html), [feature plans](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html), [`CreateUserPoolClient`](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateUserPoolClient.html), [access token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html), [refresh tokens](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html), [Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-working-with-lambda-triggers.html).

## Default values and their evidence

What the type starts with, and how sure each default is.

| Component | Setting | Default | Evidence |
|---|---|---|---|
| Cognito | `userAuthenticationPerSec` | 120/s | Documented default for the account and Region ([quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html)); see COG-1 for scope |
| Cognito | `signInLatency` | median 200 ms, p99 800 ms | Assumption, near one user's report of 200–300 ms a warm call (COG-5) |
| Cognito | `refreshLatency` | median 100 ms, p99 400 ms | Assumption: a refresh checks no password (COG-5) |

## Quotas

| Quota | Default | Raisable | Scope | Modeled |
|---|---|---|---|---|
| `UserAuthentication` requests (sign-in and refresh) | 120 per second | Yes: request a higher account-level maximum in Service Quotas (some are approved at once, others take up to about 10 days), then set the provisioned limit, billed above the default | Per account and Region, shared by every user pool | Yes, as `userAuthenticationPerSec`, per component (COG-1) |
| Challenge responses (`RespondToAuthChallenge`, `AdminRespondToAuthChallenge`) | 3 × `UserAuthentication` | Follows `UserAuthentication` | Per account and Region | No (COG-3) |
| Requests for one user (`InitiateAuth`, `RespondToAuthChallenge`, `GetUser`, and other reads; writes have their own) | 10 per second | Not stated | Per user | No (COG-4) |
| Every other category: `UserCreation` (sign-up) 50, `UserRead` 120, `UserAccountRecovery` 30, `UserFederation` 25, `ClientAuthentication` 150, and more | As listed | Some | Per account and Region | No (COG-8) |
| Requests to a managed login domain | 500 per second; 300 from one IP address | No | Per domain | No (COG-8) |

AWS ties the default to user count: "AWS accounts with fewer than two million MAUs can operate within the default quota." It doesn't depend on the feature plan.

Evidence: Documented: [quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html).

## Behavior under load

- **Over the quota:** refused with `TooManyRequestsException`, HTTP 400. The AWS SDKs class `TooManyRequestsException` as a throttling error and retry it, by default after a jittered wait of up to 1,000 ms and then up to 2,000 ms, three attempts in all. An edge with the AWS SDK standard preset retries it so (ENG-2). Documented: [`InitiateAuth` errors](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_InitiateAuth.html#API_InitiateAuth_Errors), [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).
- **Scaling:** none of its own. The quota is fixed until you raise it, and AWS measures it as "the aggregate rate of all requests from all user pools" in the account and Region (COG-1). Documented: [quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html).
- **Bursts:** AWS gives the quota per second and says nothing about a burst over it (COG-2). Assumption.
- **Latency:** AWS doesn't publish it. One user measured 200–300 ms a call from Lambda, after a first call of 2–3 s (COG-5). A Lambda trigger runs synchronously inside the sign-in, and must answer within 5 seconds (COG-6). Observed: [aws-sdk-js issue 3419](https://github.com/aws/aws-sdk-js/issues/3419); Documented: [Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-working-with-lambda-triggers.html).
- **Token checks:** an API Gateway JWT authorizer checks each token against the issuer's public keys, which "API Gateway caches … for up to two hours on a best-effort basis", so the pool sees no request for it. Documented: [JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).

## Rejection reasons

Each reason the type rejects with, and its [error kind](../../../glossary.md#error-kind), which decides whether an edge may retry it (ADR-0025).

| Reason | Error kind | Evidence |
|---|---|---|
| `too-many-requests` | throttling | Documented: a `TooManyRequestsException`, which the SDKs class as throttling ([AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)) |
