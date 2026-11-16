# Video brief guidance

This guidance applies to the HTML animation scenes that a model writes for the app to record frame by frame into a video. One scene makes one video, and the result is a short movie without sound.

## 1. Page contract

- The page starts paused. It must not begin playing on its own.
- Always define this object:

  ```
  window.naddleVideo = {
    durationMs: 25000,
    seek(ms) { /* draw the frame at ms */ },
  }
  ```

- `durationMs` must equal the length the brief asks for and must not exceed 90000.
- `seek(ms)` receives a time from 0 to `durationMs` and draws the scene at that moment. Calling it repeatedly with the same time must draw the same frame.
- The app does not let time flow by itself. It moves the scene only through this function. Do not rely on `requestAnimationFrame` to run a clock on its own.

## 2. Libraries you may use

- Use only the libraries the app provides: the browser's built-in animation (WAAPI and CSS), anime.js and three.js.
- Load libraries only from the app's `naddle-video-lib://` address.
- GSAP is not available. Do not use a CDN, remote scripts or remote fonts.
- Use system fonts or the fonts the app ships. Do not download font files.
- Use three.js only for the 3D template. Every other template uses WAAPI/CSS and anime.js.

## 3. Forbidden

- Do not use the network. Do not use `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon` or a remote `import()`.
- Do not add `<video>`, `<audio>`, `<iframe>`, `<object>` or `<embed>`. Do not add background music, narration or sound effects. Videos from this app are silent.
- Do not use random values without a fixed seed. Recording the same scene twice must produce the same frames.
- Do not use `eval`, `new Function` or code built as a string at run time.
- Do not request camera, microphone, clipboard, notification or location permission.
- Do not open a new window or navigate to another address.

## 4. Layout and text

- Leave a safe margin. Keep the inner 5% of the width and height at every edge free of content.
- Keep body text at or above 24px at 1080p. Titles are larger.
- Keep strong contrast between text and background. Do not rely on color alone to separate information.
- Fix the frame to one of the brief's aspect ratios, 16:9, 9:16 or 1:1, and do not mix others.

## 5. Length and performance

- The maximum length is 90 seconds. Aim for the brief's `durationSec.default` and stay within `min` and `max`.
- Use 1920×1080, 1080×1920 or 1080×1080 to match the aspect. Do not go larger.
- Do not exceed 30 frames per second.
- Each frame must draw within 5 seconds. Avoid heavy shadows, filters and dozens of simultaneous animations.
- The generated HTML must not exceed 1 MB.

## 6. Content

- Do not invent numbers, company names, people's names or product names the user did not provide.
- Use numbers exactly as entered. Do not round them or change their units.
- Do not state facts as certain when they are not confirmed.
- Do not add content the brief's questions did not ask for. Leave a blank empty rather than filling it in.

## 7. 3D showcase

- Build the three.js scene from basic primitives only, such as boxes, cylinders, spheres, cones and planes.
- Do not load external model files such as glTF, OBJ or FBX.
- Show materials with the built-in materials and colors, and do not use external texture images.
- Assume the 3D template cannot be rendered where WebGL is unavailable.
