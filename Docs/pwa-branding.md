# Installation branding

The current installed name is Mewallet. New installations use
`/mewallet-v3.webmanifest` and the `mewallet-v1-*` icon files.
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

Initial HTML, React loading, and synchronization overlays share the versioned
`/mewallet-loading-v2.js` canvas renderer. It copies the original transparent PNG
with drawImage at device-pixel resolution, then makes only its existing alpha
pixels white with source-in. Eyes, mouth, outline and transparent gaps are not
redrawn or filled in. The CSS alpha mask remains a fallback until painting.
Compare first paint and React, including DPR 1, 2 and 3 and automatic dark mode.
Samsung Internet startup behavior still requires device verification.

Loading glyph brightness: use a solid-white gradient for the mask fill and
`color-scheme: only light` on the glyph, avoiding a flat CSS background that a
browser's automatic dark mode may recolor. Disable glow filters on the loading
logo in both initial HTML and final loading CSS. This is a mitigation for the
dim logo in the Samsung recording, not proof of a reproduced device fix.

## Samsung Internet native splash padding

The supplied 2026-10-03 recording shows a square icon frame before the web
loading screen appears. Changing HTML/CSS cannot affect that native phase.
The previous any-only workaround removed that box on the user's device, but
the user then reported a white launcher border. Android can normalize any-only
icons onto a white background. The new trial offers a 192px `any maskable`
launcher icon and retains the 512px `any` splash icon. This is NOT a standardized
launcher/splash routing guarantee: Samsung may still prefer the smaller maskable
icon for its native splash, so check both screens on the same real installation.
Do not claim both fixed from manifest parsing or desktop previews alone.
Progressier reports Samsung Internet adds a white padded box when maskable
icons are supplied; omitting them is the fallback if the split trial regresses:
https://intercom.help/progressier/en/articles/9795029-about-the-splash-screens-of-pwas-installed-from-samsung-internet

Verify on the
Samsung device after its installation metadata refreshes; an already installed
app may retain the old maskable icon metadata. Do not delete app/site data as
part of an automatic repair.
