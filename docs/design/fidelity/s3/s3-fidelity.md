# Fidelity: S3

Where Wind Tunnel's model of Amazon S3 differs from AWS. How to read an entry, and the differences that matter most, are on the [fidelity index](../../fidelity.md). Its settings and defaults are in its [profile](s3-profile.md).

#### S3-1: One partitioned prefix per component

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** A key distribution on the workload, as DDB-3 does. Nothing; no Roadmap item yet.
- **Checked:** 2026-11-19
- **Wind Tunnel:** a component is one prefix with one read rate and one write rate. A bucket whose keys spread across prefixes is several components, each with its own calls.
- **AWS:** the rates apply "per partitioned Amazon S3 prefix", and a bucket can have any number of prefixes, so spreading keys across prefixes multiplies a bucket's rate: 10 prefixes can serve 55,000 reads per second. Which keys share a partition is S3's choice, not visible to you.
- **Evidence:** Documented: [performance guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html).
- **Skew:** Pessimistic for a bucket whose load spreads across prefixes, if it's modeled as one component. Accurate for a hot prefix, where S3's lesson is.
- **To close:** a key distribution on the workload, and a rate per prefix.

#### S3-2: A prefix's rate is fixed for the run

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Evidence of how fast S3 scales, which AWS doesn't publish. Nothing in the engine; no Roadmap item yet.
- **Checked:** 2026-11-19
- **Wind Tunnel:** `readsPerSec` and `writesPerSec` hold for the whole run, and every request over them is refused.
- **AWS:** S3 "automatically scales in response to sustained new request rates"; the scaling "happens gradually and is not instantaneous", with some 503s until it completes. The documented rates are "at least" what a prefix serves, so a prefix S3 has already scaled serves more.
- **Evidence:** Documented: [performance guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html), [performance design patterns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html). How long scaling takes is unknown.
- **Skew:** Pessimistic for load that stays over the rate for long enough for S3 to scale, and for a prefix already scaled. Close for a spike shorter than S3's scaling, whose length we don't know.
- **To close:** a rate that rises while load stays over it, once there's evidence of how fast, which the rate-limited base would have to support.

#### S3-3: The rate's burst is one second of requests

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-19
- **Wind Tunnel:** each rate is a token bucket holding one second's requests (5,500 reads, 3,500 writes), refilled at the rate, and it starts full. There's no burst setting.
- **AWS:** gives the rates per second and doesn't say how requests are counted within the second, or whether a quiet prefix can take a burst over them.
- **Evidence:** Assumption.
- **Skew:** Mixed. A bucket smaller than S3's lets fewer requests through a sudden spike; a larger one, more.
- **To close:** evidence of how S3 counts a second's requests.

#### S3-4: Requests refused with 503 Slow Down fail immediately

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** ENG-2's AWS SDK retry preset (M8 item 6).
- **Checked:** 2026-11-19
- **Wind Tunnel:** a refused request fails, and the caller's edge decides whether to retry.
- **AWS:** "each AWS SDK implements automatic retry logic using exponential backoff" for `503 Slow Down`. The SDKs class `SlowDown` as a throttling error: three attempts by default, waiting a random time up to 1,000 ms before the first retry and 2,000 ms before the second.
- **Evidence:** Documented: [performance design patterns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html), [AWS SDKs retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).
- **Skew:** Mixed, as DDB-4. Without SDK-like retries on the edge, the model fails requests that AWS would get through after a delay; with them, the delays and the extra load show up.
- **To close:** use the ENG-2 preset on edges into S3 in templates.

#### S3-5: Latency doesn't depend on the object's size

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Per-step request profiles (M8 item 4).
- **Checked:** 2026-11-19
- **Wind Tunnel:** each read and each write takes a time drawn from its action's latency setting, whatever the object.
- **AWS:** small requests take tens of milliseconds at the median; a larger object takes longer, by its size over the connection's throughput, and AWS advises splitting large transfers into parallel byte-range or multipart requests.
- **Evidence:** Documented: [performance design patterns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html).
- **Skew:** Optimistic for large objects, if the latency settings are left at their small-object defaults.
- **To close:** an object size on the step, and a transfer time from it.

#### S3-6: Only S3 Standard

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-19
- **Wind Tunnel:** every component behaves as a general purpose bucket in S3 Standard.
- **AWS:** objects in S3 Glacier Flexible Retrieval or Deep Archive must be restored before a `GET`, which takes minutes to hours. S3 Express One Zone is a different kind of bucket (a directory bucket) "designed for applications that require single-digit millisecond latencies and can support hundreds of thousands of requests per second".
- **Evidence:** Documented: [performance design patterns](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html). Assumption: the Infrequent Access classes serve requests as Standard does.
- **Skew:** Pessimistic for a design that would use Express One Zone; Optimistic for one reading archived objects.
- **To close:** Express One Zone as its own type, if a template needs it. Archived reads are out of the model's reach.

#### S3-7: SSE-KMS makes no requests to KMS

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Account-level limits shared by components (M8 item 15), and a KMS component or limit. No Roadmap item yet.
- **Checked:** 2026-11-19
- **Wind Tunnel:** encryption costs nothing, as with SSE-S3, the default.
- **AWS:** with SSE-KMS and no S3 Bucket Key, "Each time you upload or download an S3 object that's encrypted with SSE-KMS, Amazon S3 makes a `GenerateDataKey` (for uploads) or `Decrypt` (for downloads) request to AWS KMS on your behalf." Those count against the account's shared KMS quota in the Region, and KMS throttles them over it. An S3 Bucket Key "can reduce AWS KMS request costs by up to 99 percent". The KMS page's own figures disagree: its table gives 10,000, 20,000, or 100,000 requests per second by Region, and its S3 paragraph 5,500, 10,000, or 50,000.
- **Evidence:** Documented: [KMS request quotas](https://docs.aws.amazon.com/kms/latest/developerguide/requests-per-second.html), [S3 Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html), [default encryption FAQ](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-encryption-faq.html).
- **Skew:** Optimistic for an SSE-KMS bucket without a Bucket Key under heavy load, which can hit the KMS quota before S3's rate.
- **To close:** a shared account-level KMS limit that S3 calls count against.

#### S3-8: Versions don't slow writes

- **Status:** Open
- **Kind:** Behavior
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-19
- **Wind Tunnel:** versioning isn't modeled.
- **AWS:** if a versioning-enabled bucket has objects with millions of versions, "Amazon S3 automatically throttles requests to the bucket", and `PUT` and `DELETE` requests get more `503` responses. AWS recommends fewer than 100,000 versions per object.
- **Evidence:** Documented: [troubleshooting versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshooting-versioning.html).
- **Skew:** Optimistic for a bucket that overwrites the same keys for weeks. Minor in a run of minutes.
- **To close:** probably not worth it; the threshold isn't published.

#### S3-9: No Transfer Acceleration

- **Status:** Open
- **Kind:** Setting
- **Depends on:** Nothing; no Roadmap item yet.
- **Checked:** 2026-11-19
- **Wind Tunnel:** the S3 type has no Transfer Acceleration setting. The time to reach the bucket is the calling edge's `latencyMs` (ENG-1), which a user can lower to stand for it.
- **AWS:** Transfer Acceleration is a bucket-level setting for "transfers of files over long distances between your client" and the bucket: "As the data arrives at an edge location, the data is routed to Amazon S3 over an optimized network path." It changes the path to the bucket, not how S3 serves a request, and it can take up to 20 minutes to speed up transfers after it's enabled.
- **Evidence:** Documented: [Transfer Acceleration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration.html). Assumption: it doesn't change S3's request rates or service time.
- **Skew:** Minor. Wind Tunnel models services in one Region, where a client's long-distance path isn't in the model.
- **To close:** probably not worth it; an edge's latency already stands for the path.
