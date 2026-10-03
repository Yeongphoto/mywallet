# Installation branding

The current installed name is Mewallet. New installations use
`/mewallet-v1.webmanifest` and the `mewallet-v1-*` icon files.
Every install icon source (manifest, favicon, and Apple touch icon) uses a
versioned pathname, rather than relying only on query parameters.

Treat versioned icon files as immutable. For the next artwork change, create
`mewallet-v2-*` files, update both manifests, HTML, service worker cache and
precache URLs, `_headers`, and the branding check together. Do not overwrite v1
files: existing installations can continue requesting them.

The legacy `/manifest.webmanifest` advertises the current name and icon URLs
for installations that still request it. The explicit manifest `id` preserves
the old identity inferred from `start_url`; renaming does not create a second
app or migrate stored financial data. Existing browser/launcher installations
may retain their own icon until they refresh their installation metadata.

Run `npm run build` before publishing. Verify the deployed HTML, both manifests,
and all versioned icon responses, then check a new installation in Samsung
Internet on a real device. Source checks alone do not prove installed-icon
refresh behavior.

Initial HTML, React loading, and synchronization overlays render the transparent
`/mewallet-loading-v1.png` artwork as a CSS alpha mask on a white span. This avoids
painting an image canvas as a foreground rectangle during loading. Keep the
initial HTML mask and React CSS mask in sync; check both before JavaScript loads
and after React mounts. Samsung Internet startup behavior still requires device
verification.
