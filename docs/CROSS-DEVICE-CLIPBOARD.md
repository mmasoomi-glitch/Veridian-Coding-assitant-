# Cross-device clipboard / inter-device memory

Copy something on one machine and see/restore it on any of your other machines —
without the central server ever being able to read it.

## How it works (end-to-end encrypted)

```
PC-A  copy "x"  ──encrypt(x, KEY)──▶  CENTRAL (pr.afaq24.store)   stores ciphertext only
                                          │  (no key — cannot read)
PC-B  pull  ◀── ciphertext ───────────────┘
PC-B  decrypt(ciphertext, KEY) ──▶ shows "from PC-A", click to restore to clipboard
```

- Each device shares one secret: **`VERIDIAN_SYNC_KEY`** (any strong passphrase, the
  same value on every machine). A 256-bit key is derived from it with scrypt.
- A copied value is encrypted with **AES-256-GCM on the source device** before it
  leaves. The central server stores only the opaque ciphertext blob + a
  redaction-safe preview. It has no key and never decrypts.
- On pull, the receiving device decrypts locally. Wrong/absent key → it simply
  can't read the entry (fails closed).
- This is a **separate channel** from the machine-state sync, so the F-004
  guarantee still holds: the central box never sees plaintext clipboard in either
  path.

## Enable it (on EACH machine)

Set these env vars (e.g. in your env file / before `npm run dev`):

```
CENTRAL_URL=https://pr.afaq24.store      # the central command server
VERIDIAN_SYNC_KEY=<same strong passphrase on every device>
MACHINE_ID=laptop-1                       # optional, stable name (defaults to hostname)
CENTRAL_AUTH=user:pass                    # optional HTTP Basic to the central server
SYNC_INTERVAL_MS=30000                    # optional push/pull cadence (default 30s)
```

- **No `CENTRAL_URL`** → nothing syncs (fully local).
- **No `VERIDIAN_SYNC_KEY`** → clipboard sync is off even if `CENTRAL_URL` is set
  (the encrypted-export returns nothing). Everything stays local.

### Secrets
By default, clipboard entries detected as **secrets stay on the machine that copied
them** (they are not exported). Because the channel is E2E encrypted, you can opt to
sync secrets too (they remain unreadable to the central server):

```
VERIDIAN_SYNC_CLIP_SECRETS=1
```

## Using it
Open the **Clipboard** tab. The list is the unified newest-first view across all your
devices. Entries from another machine show a chip like **"from laptop-2"**; local
entries show **"this PC"**. Click **restore** on any entry — local or remote — to put
that value back on the current machine's clipboard. The header shows
**"Cross-device sync on · N from other devices"** when a key is configured, or
**"Local only"** otherwise.

## What the central server stores
`clip-sync.json`, per machine: `{ id, ts, blob (ciphertext), preview (masked), isSecret, length }`.
No plaintext, no key. Capped at 100 entries/machine, 200 returned per pull.

## Endpoints
- `POST /api/sync/clip/push` `{ machineId, hostname, entries[] }` — central ingest (ciphertext)
- `GET  /api/sync/clip/pull?exclude=<machineId>` — central returns all blobs
- `GET  /api/clipboard/unified` — local merged view (remote decrypted locally; preview+origin only)
- `GET  /api/clipboard/sync-status` — `{ ready, remoteCount, includesSecrets }`
- `POST /api/clipboard/restore` `{ id }` — restore local OR remote entry

## Files
- `lib/sync-crypto.ts` — AES-256-GCM E2E (key from `VERIDIAN_SYNC_KEY`)
- `autopilot/clip-sync-store.ts` — central ciphertext store
- `autopilot/clip-history.ts` — `exportForSync` / `ingestRemote` / `unifiedList` / `restoreAny`
- `autopilot/sync-client.ts` — `startClipSyncClient` transport
- `tests/clip-sync.test.ts` — E2E round-trip + "central never sees plaintext" proof
