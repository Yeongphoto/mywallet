# Installation branding

The current installed name is Mewallet. New installations use
`/mewallet-v5.webmanifest`, the new rounded 192px SVG, and the existing 512px PNG.
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
icons onto a white background. The 192px `any maskable` / 512px `any` split trial
REGRESSED the native splash on the user's device. Size does not isolate launcher
and splash selection. All install routes are restored to any-only icons.
Do not reintroduce maskable (even combined purposes or small sizes) to fix the
launcher border: this device has confirmed that approach breaks the splash.
The launcher border remains unresolved; do not claim both fixed.
The next image-only trial uses `/mewallet-v2-launcher-192.svg`: it embeds the
unchanged 192px PNG and clips only the outer black corners with a rounded rect.
Both purposes stay `any`; the 512px PNG, theme/background colors, PWA identity,
and loading renderer stay unchanged. Chromium's legacy shortcut code adds
padding to icons with opaque corners. This is a hypothesis for Samsung, not a
guarantee: Samsung may wrap the icon anyway or choose the unchanged PNG if its
installer does not accept SVG. Verify both launcher and native splash on-device.
Progressier reports Samsung Internet adds a white padded box when maskable
icons are supplied; omitting them is the device-confirmed workaround:
https://intercom.help/progressier/en/articles/9795029-about-the-splash-screens-of-pwas-installed-from-samsung-internet

Verify on the
Samsung device after its installation metadata refreshes; an already installed
app may retain the old maskable icon metadata. Do not delete app/site data as
part of an automatic repair.
