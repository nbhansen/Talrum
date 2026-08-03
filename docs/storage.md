# Storage: signed URLs and the caches that make them survivable

Every user-uploaded photo and voice recording lives in two private Supabase
Storage buckets — `pictogram-images` and `pictogram-audio` — readable only
via signed URLs. Bucket RLS (first path segment must equal `auth.uid()`) is
covered in [auth.md](./auth.md); this page is about the read path: how a
storage path in a pictogram row becomes bytes on screen, and why that takes
three caches. The inline doc comments in `src/lib/storage/storage.ts` carry the
per-decision detail.

## Why cache signed URLs at all

A signed URL is a network round-trip to mint and expires
(`SIGNED_URL_TTL_SECONDS` in `src/lib/storage/storage.ts`). A kid-mode board shows a
dozen photos at once and must keep working in the car with no signal. Minting
on every render is too slow online and impossible offline — so URLs are
cached, persisted, and, when all else fails, served stale.

## The shape

```
<PictogramMedia>                    src/widgets/PictoTile/PictogramMedia.tsx
  │ stock: sentinel → bundled /seed-photos/<slug>.jpg, no Supabase at all
  ▼
useSignedUrl(bucket, path)          src/lib/storage/useSignedUrl.ts
  │ null while resolving (placeholder), re-runs on path change
  ▼
signedUrlFor(bucket, path)          src/lib/storage/storage.ts
  │ 1. memory  — signedUrlMemCache (src/lib/storage/storage-cache.ts), per-tab
  │ 2. IDB     — `signed-url:{bucket}/{path}` keys, survives reloads
  │ 3. mint    — supabase createSignedUrl, write back to both tiers
  │ mint failed? → return whichever stale entry exists
  ▼
<img src>  →  service worker        vite.config.ts (workbox)
     CacheFirst on /storage/v1/object/*, cache `talrum-storage-v1`
```

Audio takes the same path minus the hook and minus the media element:
`playPictogramAudio` in `src/lib/platform/audio.ts` awaits `signedUrlFor`,
fetches the clip, and plays the bytes through a blob object URL. The fetch
matters: a media element always sends a `Range` header, Supabase answers
`206 Partial Content`, and the SW cache rejects a 206 (#378). The plain
fetch gets a CORS 200 that the service worker stores like any photo, so a
previously played recording also plays offline.

## The three tiers

1. **Memory** — a plain `Map` (`signedUrlMemCache`). Hit only when the
   entry has a safety margin of validity left; the margin keeps a URL that
   expires mid-image-load from being handed out.
2. **IndexedDB** — the same `{url, expiresAt}` entries under
   `signed-url:`-prefixed keys, so a reload (or the PWA relaunching) doesn't
   re-mint every URL on screen. A valid IDB hit also re-hydrates memory.
3. **Mint** — `createSignedUrl`, persisted to both tiers on the way out.

`blob:` paths short-circuit before any of this: a photo created offline
renders from `URL.createObjectURL` until the outbox uploads the real blob.

## Offline: stale URLs are fine, on purpose

When minting fails (offline, transient network), `signedUrlFor` returns the
expired entry instead of throwing. That sounds wrong — the token is dead —
but the service worker makes it safe: the persisted URL is the one the
last successful _mint_ produced, and the cache keys include the
`?token=...` query on purpose (see the `matchOptions` note in
vite.config.ts) — so when that URL also served the last successful load
(the common case), returning it reproduces the exact cache key, the SW
answers from `talrum-storage-v1`, and the request never reaches Supabase.
The two can desync: a mint that succeeds right before the load after it
fails leaves the cached bytes keyed under the _previous_ URL, unreachable
until that token expires or a load succeeds again. The cost is a
placeholder (photos) or the TTS fallback (audio) for up to an hour, not an
error. The two caches are complementary: the URL cache keeps the _request_
stable so the SW cache can keep serving the _bytes_. Only an object never
loaded on this device is genuinely unreachable offline.

## The `stock:` sentinel

Seed templates ship photo pictograms whose `image_path` is
`stock:<slug>` (`STOCK_PATH_PREFIX`) — a pointer at a bundled
`/seed-photos/<slug>.jpg` static asset, so fresh users see real photos with
zero uploads and zero Storage traffic. `PictogramMedia` resolves the
sentinel before ever calling `useSignedUrl`; `isUploadedStoragePath` is the
guard the rest of the codebase uses to tell real paths from sentinels.

## Writes and invalidation

Uploads and deletes go through `uploadBlob` / `removeFromBucket` in
`src/lib/storage/storage.ts`, called only from outbox handlers (see
[outbox.md](./outbox.md)). Handlers call `invalidateSignedUrl` after
replacing or deleting an object, dropping the memory and IDB entries so the
next render can't sign a URL for bytes that changed underneath it.

## Sign-out

`clearPersistedCache` (src/lib/queryClient.ts, #178) sweeps every
`signed-url:` key at auth boundaries alongside the query cache and outbox —
the entries reference the previous user's storage paths. The full sign-out
wipe is documented in [offline-cache.md](./offline-cache.md).
