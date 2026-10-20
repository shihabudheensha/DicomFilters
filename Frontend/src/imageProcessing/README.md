# imageProcessing

OpenCV.js image filters for Cornerstone3D stack viewports:
**Smoothing → Unsharp Mask → Contrast → Gamma**, always applied to a copy of
the original pixels. No UI is included; each project builds its own controls.

## Requirements

- React 18+
- `@cornerstonejs/core` v2 (StackViewport)
- OpenCV.js: `npm i @techstark/opencv-js`

No bundler configuration is needed for OpenCV.js.

## Integration

1. Copy this folder into your project (e.g. `src/imageProcessing/`).
2. Import only from the folder (its `index.ts`), never from files inside it.
3. After the viewport has loaded its image, create a filter and pass it to the
   hook. Wire your own controls to what the hook returns.

```tsx
import { useEffect, useRef, useState } from "react";
import { RenderingEngine, Enums, type Types } from "@cornerstonejs/core";
import {
  createViewportFilter,
  FILTER_CONTROLS,
  useViewportFilters,
  type ViewportFilter,
} from "./imageProcessing";

export function Viewer({ imageId }: { imageId: string }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<ViewportFilter | null>(null);
  const filters = useViewportFilters(filter);

  useEffect(() => {
    const engine = new RenderingEngine("engine");
    engine.enableElement({
      viewportId: "stack",
      element: elementRef.current!,
      type: Enums.ViewportType.STACK,
    });
    const viewport = engine.getViewport("stack") as Types.IStackViewport;

    viewport.setStack([imageId]).then(() => {
      viewport.render();
      setFilter(createViewportFilter(viewport)); // after the image loads
    });

    return () => {
      setFilter(null);
      engine.destroy();
    };
  }, [imageId]);

  return (
    <>
      {FILTER_CONTROLS.map((control) => (
        <label key={control.key}>
          {control.group} {control.label}
          <input
            type="range"
            min={control.min ?? 0}
            max={control.max ?? 100}
            value={filters.settings[control.key]}
            disabled={!filters.ready || filters.unsupportedReason !== null}
            // Update while dragging; process only on release
            onChange={(e) =>
              filters.updateSetting(control.key, Number(e.target.value))
            }
            onPointerUp={(e) =>
              filters.commitSetting(control.key, Number(e.currentTarget.value))
            }
            onKeyUp={(e) =>
              filters.commitSetting(control.key, Number(e.currentTarget.value))
            }
          />
          {control.format(filters.settings[control.key])}
        </label>
      ))}
      <button onClick={filters.reset}>Reset</button>
      {filters.processing && <span>Processing…</span>}
      {filters.unsupportedReason && <span>{filters.unsupportedReason}</span>}
      <div ref={elementRef} style={{ width: 800, height: 600 }} />
    </>
  );
}
```

Optional: call `initOpenCV()` at app start so the first filter run doesn't
wait for OpenCV to load.

## API

| Export | Purpose |
|---|---|
| `createViewportFilter(viewport, { debug? })` | Filter for the viewport's current image. Returns `{ supported, unsupportedReason, appliedSettings, apply(settings), reset() }`. Framework-free. |
| `useViewportFilters(filter)` | React state for a filter: `settings`, `ready`, `processing`, `unsupportedReason`, `updateSetting`, `commitSetting`, `reset`. Pass `null` until the image is loaded. |
| `FILTER_CONTROLS` | Slider metadata for building UI: `key`, `label`, `group` (pipeline order), `min`/`max` (default 0–100), `format(value)`. |
| `DEFAULT_FILTER_SETTINGS`, `FilterSettings`, `FilterKey` | Settings shape and defaults (all filters off). |
| `areFilterSettingsEqual(a, b)` | True when a re-run would change nothing. |
| `processImage(pixels, width, height, luminanceRange, settings, { debug? })` | The raw pipeline (pixels in → same-type pixels out), for use without Cornerstone. |
| `initOpenCV()` | Loads OpenCV.js once; safe to call repeatedly. |

`debug: true` logs the filter values used and changed-pixel stats per
preview. The stats are a full-image pass, so leave it off in production.

## Constraints

- **One filter per image.** Create a new filter with `createViewportFilter`
  whenever the viewport shows a different image (new `setStack`, scrolling a
  stack). It keeps a copy of the original pixels it was created with.
- **Filters write into the cached Cornerstone image**, so measurement tools
  read the filtered values until `reset()`.
- **Supported pixel data:** grayscale of any pixel type (8/16-bit,
  signed/unsigned, float) and RGB. Colour is filtered on brightness only, so
  hue is kept. Other layouts report `unsupportedReason`.
- **Processing runs on the main thread**, so the UI pauses briefly while a
  large image is filtered; large Unsharp Mask radii are the slowest setting.

## Tuning and extending

- **Ranges and curves:** `filterConfig.ts` maps each slider value to the real
  filter parameter (e.g. `smoothingSigma`, `contrastFactor`). Change them
  there; the UI and pipeline pick them up.
- **Adding a filter:**
  1. Add its setting, default, mapping function and `FILTER_CONTROLS` entry
     in `filterConfig.ts`.
  2. Add a step file (e.g. `myFilter.ts`) that takes a CV_32FC1 `Mat` and
     returns a new one, like `contrast.ts`.
  3. Add one `if (...) current = replace(current, myFilter(...))` line in
     `filterPipeline.ts` at the right point in the order, and include it in
     the "all filters off" check.
