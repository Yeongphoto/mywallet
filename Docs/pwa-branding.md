# Installation branding

The current installed name is Mewallet. New installations use
`/mewallet-v2.webmanifest` and the `mewallet-v1-*` icon files.
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

## Samsung Internet native splash padding

The supplied 2026-10-03 recording shows a square icon frame before the web
loading screen appears. Changing HTML/CSS cannot affect that native phase.
The current and both legacy manifests therefore offer only `purpose: any`
icons. The previous maskable PNGs remain available for old requests but are not
advertised. Progressier reports Samsung Internet adds a white padded box when
maskable icons are supplied; omitting them is a workaround:
https://intercom.help/progressier/en/articles/9795029-about-the-splash-screens-of-pwas-installed-from-samsung-internet

This can change adaptive launcher icon padding in other browsers. Verify on the
Samsung device after its installation metadata refreshes; an already installed
app may retain the old maskable icon metadata. Do not delete app/site data as
part of an automatic repair.
