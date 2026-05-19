# Icons

Drop real PNG icons here:

- `icon-192.png` — 192×192, used for the manifest (any + maskable) and as
  the notification icon/badge and Apple touch icon.
- `icon-512.png` — 512×512, used for the manifest (any + maskable) and
  for the splash screen on Android.

For maskable icons, keep the important visual content inside a centered
safe zone of ~80% so OS-specific masks don't crop the kebab. Use a
solid background (matching `theme_color` `#ea580c` or
`background_color` `#0f172a`).

A real icon set can be generated from a single source SVG with e.g.
`pwa-asset-generator` or `sharp`. Until then, the manifest still points
at these paths, so the build will succeed only once real PNG files are
present.
