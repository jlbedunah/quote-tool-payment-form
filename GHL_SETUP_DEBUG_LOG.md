# GoHighLevel API Setup Debug Log

## 2025-11-07
- Confirmed `GHL_LOCATION_ID` as `TSS1PpAsOTTRVyUrnXvG` and stored in `.env.local`.
- Generated Private Integration token (`pit-…`) to serve as `GHL_API_KEY`.
- Added `GHL_PIPELINE_ID=r6uZRjRGlM3SFCvhcQ66` to `.env.local`.
- Attempted to list pipelines via `curl https://services.leadconnectorhq.com/pipelines/` with headers `Authorization`, `Version: 2021-07-28`, and `LocationId`. Response body empty despite HTTP 200.
  - Suspected missing scopes on the Private Integration; revisited integration to ensure Opportunities → Read access is enabled.
- Alternative discovery strategy noted: query existing opportunities to read `pipelineId` / `stageId` when pipeline list is unavailable.
- Decided to defer direct pipeline/custom-field updates; webhook now creates note + applies product tags, with GoHighLevel workflow handling stage/custom-field automation.
- Next actions:
  - Re-run pipeline request after confirming scopes (use `curl -v` for diagnostics).
  - If still blank, pull opportunities with `GET /opportunities/search` to obtain `stageId` for `GHL_WON_STAGE_ID`.
  - Populate remaining environment variables in `.env.local` and Vercel dashboard once IDs confirmed.
