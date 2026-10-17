# Events

Events lives at `/events`, with one permanent `/events/:slug` address per event. The Events action in the dock and the Participation link open it. GitHub sign-in and a linked, active WhatsApp group account are required, following Participation's access policy. A stale bot membership snapshot fails closed. Admin preview uses the separate existing admin session.

## Managing events

Open `/admin`, choose Events, then Create event. Save an incomplete draft first to reserve its permanent address and enable uploads. Add the title, summary, full description, host, platform, start/end times and timezone before publishing. A joining link is optional; the page explains when it has not been supplied. The timezone defaults to Africa/Lagos. Dates are stored as UTC milliseconds and edited/displayed in the selected timezone, including events crossing midnight. Changing timezone preserves the instant; changing the dates reschedules it.

Save changes updates a published event immediately. Unpublish hides the entire event from members. Cancelled is an explicit checkbox; upcoming, ongoing and ended derive from time, while recording availability requires a completed, validated upload. Editing the title or schedule preserves the original slug.

Add HTTPS resource links or upload files, then edit titles/descriptions, move entries up/down or remove them. Save the resource changes. Removing a resource revokes the application download route. Files are retained privately for recovery; removal does not delete objects from R2. Preview member page shows the saved version, including private drafts, using admin authorization.

## Private R2 configuration

The feature requires migration `006_events.sql` through the normal migration command. Apply it only to the intended database after review; `.env.local` may point at production. Existing migrations and community records are unchanged. Production requires Postgres; development without it uses atomic local JSON in ignored `.data/events.json`.

Set these server-only variables:

| Variable | Meaning |
| --- | --- |
| `EVENT_R2_ACCOUNT_ID` | Cloudflare account ID. |
| `EVENT_R2_BUCKET_NAME` | Separate private bucket; must differ from `R2_BUCKET_NAME`. |
| `EVENT_R2_ACCESS_KEY_ID` | S3 credential limited to reading/writing the event bucket. |
| `EVENT_R2_SECRET_ACCESS_KEY` | Matching S3 secret. |
| `EVENT_R2_API_TOKEN` | Read-only Cloudflare management API token able to read that account's R2 bucket domain settings. |

Keep the bucket's r2.dev development URL disabled and all public custom domains disabled. Do not expose its objects through a public Worker or another delivery service. The server checks managed and custom domain settings before uploads and downloads, caching successful checks for at most one minute. An unavailable privacy check disables media access. This does not modify any bucket permissions. The existing public portfolio bucket, URLs and 3 MB handler remain separate.

Set bucket CORS with the exact production website origin. For local upload testing, add the exact local origin separately; never use `*`. Example:

```json
[
  {
    "AllowedOrigins": ["https://opencircle.cc"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Configure an R2 lifecycle rule to abort incomplete multipart uploads after one day. Upload authorization expires after one day. Cancel explicitly aborts the multipart upload; unexpected page closure can leave an incomplete upload for that lifecycle rule. A failed database write or validation can leave an unattached private object; retain it for investigation and remove it through an authorized storage cleanup. No storage cleanup job or public bucket configuration is applied automatically.

Cloudflare documents [presigned upload URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/), and [bucket domain settings](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/).

## Uploads and delivery

- Covers: PNG, JPEG or WebP, up to 3 MiB. Add alternative text before publishing or replacing a published cover.
- Recordings: MP4 or WebM, up to 5 GiB. Use H.264/AAC for MP4 or VP8/VP9 with Opus for WebM. Export for web playback, preferably MP4 with fast start. Uploading does not transcode unsupported codecs. Add captions/transcripts as resources where available.
- Resources: PDF, UTF-8 text, Markdown, ZIP or `.pptx`, up to 50 MiB. Uploaded resources are forced downloads with a sandbox and `nosniff`; HTML and SVG are not accepted. Archives are downloads and are not extracted or executed by the website.

All files upload directly from the browser to private object storage in 16 MiB parts. The application server signs individual parts for 15 minutes. It never buffers recordings. The interface shows progress, retries from the failed part while the page remains open, and supports cancellation. Keep the page open during upload; a closed page requires choosing the file again. Editors are locked while an upload is pending to protect unsaved edits.

The server authorizes initiation, each part, completion and cancellation; it binds upload IDs to the admin and event, lists actual storage parts, verifies their sizes, checks the completed object's key, ownership metadata, type and total size, and checks file signatures before attachment. Browser URLs and ETags are not attachment proof. Completion is idempotent. Existing covers/recordings remain attached until replacements validate and commit.

Playback and downloads stream through `/api/event-media` with a fresh session and membership check per request. Single HTTP byte ranges support seeking; unsatisfiable ranges return 416. The player has standard controls and a retry state. There is no expiring playback URL to interrupt a long recording. Sign-out cancels and removes private event queries; responses and media use private/no-store caching. An already delivered join link or downloaded byte cannot be recalled.

## Bot sessions

Bot-generated recurring sessions remain in Participation, labelled Bot schedule. Website events own their recordings/resources and never write to the bot, send announcements or change group settings. For a matching title/start time, Participation links to the website event instead of repeating the bot details. Save an existing bot session ID on the event to keep that association when rescheduling or cancelling. Explicit IDs take precedence over title/time matching. Do not create multiple website records for the same session. Unlinked bot schedules remain independent.

## Verification boundaries

Automated tests cover admin/member access, drafts, publishing, rescheduling, cancellation, idempotency, failure/retry/cancel, replacement preservation, resources, privacy configuration checks, streaming range responses and persisted metadata. Real Postgres tests use a disposable local database under `EVENTS_TEST_DATABASE_URL`; they reject non-local URLs and names without the `opencircle_events_test_` prefix.

Mocked storage tests do not verify live R2 credentials, CORS, bucket privacy or actual codec playback. Before release, configure the private bucket, upload a real cover/video/resource, confirm unauthenticated object access fails, verify progress/retry/cancel and seeking on a real recording, then perform the authorized browser/player review. No production migration, storage configuration, push, deployment or announcement is implied by local verification.
