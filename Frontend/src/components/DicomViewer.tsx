import { useEffect, useRef, useState } from "react";
import {
  RenderingEngine,
  Enums,
  eventTarget,
  type Types,
} from "@cornerstonejs/core";
import { initCornerstone } from "../cornerstone/initCornerstone";
import {
  createViewportFilter,
  FILTER_CONTROLS,
  initOpenCV,
  useViewportFilters,
  type ViewportFilter,
} from "../imageProcessing";

// Slider groups in pipeline order
const FILTER_GROUPS = [...new Set(FILTER_CONTROLS.map((c) => c.group))];

// Logs filter values and changed-pixel stats after each preview; includes a
// full-image pass, so off unless checking that filter output is unchanged
const DEBUG_FILTERS = false;

const { ViewportType } = Enums;

const renderingEngineId = "tigerview9RenderingEngine";
const viewportId = "tigerview9Viewport";

const dicomUrl = "https://localhost:7099/api/dicom/SC.df5e35cbe68bfba9.dcm";
const originalImageId = `wadouri:${dicomUrl}`;

export default function DicomViewer() {
  const elementRef = useRef<HTMLDivElement>(null);
  // Filter for the loaded image; null until the stack is ready
  const [viewportFilter, setViewportFilter] = useState<ViewportFilter | null>(
    null,
  );
  const filters = useViewportFilters(viewportFilter);

  useEffect(() => {
    let renderingEngine: RenderingEngine | undefined;
    // React StrictMode mounts twice in dev; stop the stale run after cleanup
    let cancelled = false;

    // StackViewport swallows load failures and only fires this event
    const onImageLoadError = (event: Event) => {
      console.error("Image load error:", (event as CustomEvent).detail);
    };

    eventTarget.addEventListener(
      Enums.Events.IMAGE_LOAD_ERROR,
      onImageLoadError,
    );

    async function loadDicom() {
      if (!elementRef.current) {
        return;
      }

      try {
        await initCornerstone();
        // Loaded up front so the first filter run doesn't wait for it
        await initOpenCV();
        console.log("OpenCV ready");

        if (cancelled) {
          return;
        }

        renderingEngine = new RenderingEngine(renderingEngineId);

        const viewportInput: Types.PublicViewportInput = {
          viewportId,
          element: elementRef.current,
          type: ViewportType.STACK,
        };

        renderingEngine.enableElement(viewportInput);

        const viewport = renderingEngine.getViewport(
          viewportId,
        ) as Types.IStackViewport;

        await viewport.setStack([originalImageId], 0);

        if (cancelled) {
          return;
        }

        viewport.render();

        setViewportFilter(
          createViewportFilter(viewport, { debug: DEBUG_FILTERS }),
        );
      } catch (error) {
        console.error("DICOM loading failed:", error);
      }
    }

    loadDicom();

    return () => {
      cancelled = true;
      eventTarget.removeEventListener(
        Enums.Events.IMAGE_LOAD_ERROR,
        onImageLoadError,
      );
      setViewportFilter(null);
      renderingEngine?.destroy();
    };
  }, []);

  const controlsDisabled = !filters.ready || filters.unsupportedReason !== null;

  return (
    <div>
      <div className="viewer-toolbar">
        {FILTER_GROUPS.map((group) => (
          <fieldset
            key={group}
            className="filter-group"
            disabled={controlsDisabled}
          >
            <legend>{group}</legend>
            {FILTER_CONTROLS.filter((control) => control.group === group).map(
              (control) => (
                <label key={control.key} className="filter-control">
                  <span className="filter-label">{control.label}</span>
                  <input
                    type="range"
                    min={control.min ?? 0}
                    max={control.max ?? 100}
                    step={1}
                    value={filters.settings[control.key]}
                    onChange={(event) =>
                      filters.updateSetting(
                        control.key,
                        Number(event.target.value),
                      )
                    }
                    // Filter when the user lets go, not on every drag tick
                    onPointerUp={(event) =>
                      filters.commitSetting(
                        control.key,
                        Number(event.currentTarget.value),
                      )
                    }
                    onKeyUp={(event) =>
                      filters.commitSetting(
                        control.key,
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                  <span className="filter-value">
                    {control.format(filters.settings[control.key])}
                  </span>
                </label>
              ),
            )}
          </fieldset>
        ))}
        <div className="filter-actions">
          <button disabled={controlsDisabled} onClick={filters.reset}>
            Reset
          </button>
          {filters.processing && <span>Processing…</span>}
          {filters.unsupportedReason && (
            <span>{filters.unsupportedReason}</span>
          )}
        </div>
      </div>
      <div ref={elementRef} className="cornerstone-viewport" />
    </div>
  );
}
