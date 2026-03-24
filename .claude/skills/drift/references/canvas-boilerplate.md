# Canvas Boilerplate

Use the exact templates below when creating Drift design files. Do not deviate from the boilerplate structure — CSS deviations cause export failures.

---

## Locked Formats: A4 Portrait & 16:9 Landscape

Use for `a4-portrait` (794×1123px) and `landscape-16-9` (1920×1080px).

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Project Name]</title>
    <!-- Google Fonts link here — use <link> not @import -->
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100vh;
            overflow: hidden;
        }
        body {
            font-family: /* per brand guidelines */;
            -webkit-font-smoothing: antialiased;
        }
        @media print {
            html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <!-- Design content here -->
</body>
</html>
```

**Critical rules for locked formats:**
- `height: 100vh; overflow: hidden;` on html AND body — never change these
- Never add `overflow: auto`, `overflow: visible`, `height: auto`, or `html.scrollable`
- No `@media` query breakpoints — locked canvases export at exact pixel dimensions
- Background images need `background-size: cover` and `background-repeat: no-repeat`

---

## Scrollable Formats: Desktop, Tablet, Mobile

Use for `desktop` (1440px), `tablet` (768px), `mobile` (375px), and `freeform`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Project Name]</title>
    <!-- Google Fonts link here — use <link> not @import -->
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; }
        body {
            max-width: [width]px;
            margin: 0 auto;
            font-family: /* per brand guidelines */;
            -webkit-font-smoothing: antialiased;
        }
    </style>
</head>
<body>
    <!-- Design content here -->
</body>
</html>
```

Replace `[width]` with the canvas width: 1440, 768, or 375.

**Critical rules for scrollable formats:**
- Use `max-width` not `width: 100vw` — vw causes horizontal overflow
- Content scrolls naturally; no height constraints on body
- Responsive `@media` queries are fine here (unlike locked formats)
