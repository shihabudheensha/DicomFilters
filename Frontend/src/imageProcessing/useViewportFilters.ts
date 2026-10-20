import { useRef, useState } from "react";

import {
  DEFAULT_FILTER_SETTINGS,
  type FilterKey,
  type FilterSettings,
} from "./filterConfig";
import type { ViewportFilter } from "./viewportFilter";

/** Filter state and handlers for a project's own filter UI */
export type ViewportFilters = {
  /** Slider values (update while dragging, applied on commit) */
  settings: FilterSettings;
  /** A filter exists for the current image */
  ready: boolean;
  /** A run is in progress */
  processing: boolean;
  /** Why this image can't be filtered (e.g. pixel layout), if so */
  unsupportedReason: string | null;
  /** Update a slider value without processing (e.g. while dragging) */
  updateSetting: (key: FilterKey, value: number) => void;
  /** Set a value and apply the filters (e.g. on slider release) */
  commitSetting: (key: FilterKey, value: number) => void;
  /** Restore the original image and default settings */
  reset: () => void;
};

type FilterState = {
  filter: ViewportFilter | null;
  settings: FilterSettings;
  processing: boolean;
};

const freshState = (filter: ViewportFilter | null): FilterState => ({
  filter,
  settings: DEFAULT_FILTER_SETTINGS,
  processing: false,
});

/**
 * React state for a `ViewportFilter` (from `createViewportFilter`). Pass
 * null until the viewport's image is loaded; passing a new filter (new
 * image) starts again from the default settings.
 */
export function useViewportFilters(
  filter: ViewportFilter | null,
): ViewportFilters {
  const [state, setState] = useState<FilterState>(() => freshState(filter));
  // Only the latest commit/reset may clear the processing flag
  const latestRunRef = useRef(0);

  // State saved for a previous filter (image) no longer applies
  const current = state.filter === filter ? state : freshState(filter);
  const { settings, processing } = current;

  const update = (patch: Partial<FilterState>) =>
    setState((previous) => ({
      ...(previous.filter === filter ? previous : freshState(filter)),
      ...patch,
    }));

  function updateSetting(key: FilterKey, value: number) {
    setState((previous) => {
      const base = previous.filter === filter ? previous : freshState(filter);

      return { ...base, settings: { ...base.settings, [key]: value } };
    });
  }

  async function commitSetting(key: FilterKey, value: number) {
    if (!filter?.supported) {
      return;
    }

    // Built from the released value, so a not-yet-rendered state update
    // can't make us filter with a stale value
    const nextSettings = { ...settings, [key]: value };
    const run = ++latestRunRef.current;

    update({ settings: nextSettings, processing: true });

    try {
      await filter.apply(nextSettings);
    } catch (error) {
      console.error("Filtering failed:", error);
    } finally {
      if (run === latestRunRef.current) {
        // Ignore if the filter (image) changed while this run was going
        setState((previous) =>
          previous.filter === filter
            ? { ...previous, processing: false }
            : previous,
        );
      }
    }
  }

  function reset() {
    if (!filter?.supported) {
      return;
    }

    latestRunRef.current++;

    try {
      filter.reset();
    } catch (error) {
      console.error("Reset failed:", error);
    }

    setState(freshState(filter));
  }

  return {
    settings,
    ready: filter !== null,
    processing,
    unsupportedReason: filter?.unsupportedReason ?? null,
    updateSetting,
    commitSetting,
    reset,
  };
}
