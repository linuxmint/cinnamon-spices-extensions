/**
 * Typed access to the extension settings.
 *
 * Cinnamon binds the settings to this object, so the accessors below always
 * report what is currently configured, without needing to be refreshed.
 */

import type { Gaps } from "./geometry.ts";
import { GRID_COUNT, toPreset, uniformLayout } from "./preset.ts";
import type { Preset } from "./preset.ts";
import type { WindowFilter } from "./winops.ts";
import type { Reserved } from "./workarea.ts";

const Settings = imports.ui.settings;

/** Which monitors reserved space applies to. */
export type ReservedScope = "all" | "primary";

/**
 * Settings live in a JSON file users can edit by hand, so a value that never
 * passed through the settings widgets may be of any type. The bound fields
 * below are private and every reader goes through one of the accessors, so
 * whatever leaves this module is of the type it claims to be and the rest of
 * Tiler can use it without checking first.
 */
function toNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * A measurement in pixels, which can never be negative. The settings widgets
 * enforce their own minimum, but a file edited by hand does not go near them,
 * and a negative size would grow the area it was meant to shrink.
 */
function toSize(value: number): number {
  return Math.max(0, toNumber(value));
}

/**
 * Only a real boolean counts as on. A hand-edited settings file can hold the
 * string "false", which JavaScript would otherwise treat as true.
 */
function toBoolean(value: boolean): boolean {
  return value === true;
}

/** Anything that is not a string is no keybinding at all. */
function toKeybinding(value: string): string {
  return typeof value === "string" ? value : "";
}

export class Config {
  // Binding replaces each of these with an accessor onto the stored setting.
  // The values assigned here are the fallbacks Tiler runs with if a binding
  // fails, which Cinnamon does report but does not treat as fatal. They are
  // readonly because the accessors Cinnamon installs also write: assigning to
  // one of these fields would silently rewrite the user's settings.
  private readonly rawHotkey: string = "";
  private readonly rawCenterOnWindow: boolean = false;
  private readonly rawTileDialogs: boolean = false;
  private readonly rawTileToolboxes: boolean = false;
  private readonly rawShowAutotile: boolean = true;
  private readonly rawWindowGap: number = 0;
  private readonly rawEdgeGap: number = 0;
  private readonly rawReservedScope: ReservedScope = "all";
  private readonly rawReservedTop: number = 0;
  private readonly rawReservedBottom: number = 0;
  private readonly rawReservedLeft: number = 0;
  private readonly rawReservedRight: number = 0;

  private readonly settings: imports.ui.settings.ExtensionSettings;

  /**
   * @param uuid the extension uuid, used to find the settings schema
   * @param onHotkeyChanged called whenever the configured hotkey changes
   */
  constructor(uuid: string, onHotkeyChanged: () => void) {
    this.settings = new Settings.ExtensionSettings(this, uuid);

    // Each bind returns false if the key is missing from the schema or holds
    // an unusable value. Cinnamon logs the offending key itself, and the
    // fallbacks above keep Tiler working, so there is nothing to add here.
    this.settings.bind("hotkey", "rawHotkey", onHotkeyChanged);
    this.settings.bind("center-on-window", "rawCenterOnWindow");
    this.settings.bind("tile-dialogs", "rawTileDialogs");
    this.settings.bind("tile-toolboxes", "rawTileToolboxes");
    this.settings.bind("show-autotile", "rawShowAutotile");
    this.settings.bind("window-gap", "rawWindowGap");
    this.settings.bind("edge-gap", "rawEdgeGap");
    this.settings.bind("reserved-scope", "rawReservedScope");
    this.settings.bind("reserved-top", "rawReservedTop");
    this.settings.bind("reserved-bottom", "rawReservedBottom");
    this.settings.bind("reserved-left", "rawReservedLeft");
    this.settings.bind("reserved-right", "rawReservedRight");

    // The grids are read when they are asked for rather than bound, since
    // nothing needs telling when one changes. Only the two numbers are bound,
    // for the sake of the callback: they are the plain way to set a grid up
    // and the layout is the way to say more than they can, so changing a
    // number rewrites the layout to match. Without that the two could
    // disagree with nothing to say which was meant.
    for (let i = 1; i <= GRID_COUNT; i++) {
      const rewrite = () => this.rewriteLayout(i);

      this.settings.bind(`grid-${i}-cols`, `rawGrid${i}Cols`, rewrite);
      this.settings.bind(`grid-${i}-rows`, `rawGrid${i}Rows`, rewrite);
    }
  }

  /** Puts the layout back in step with the numbers above it. */
  private rewriteLayout(index: number): void {
    this.settings.setValue(
      `grid-${index}-layout`,
      uniformLayout(
        this.settings.getValue<number>(`grid-${index}-cols`),
        this.settings.getValue<number>(`grid-${index}-rows`),
      ),
    );
  }

  /**
   * Which grid was last picked. Kept so that opening Tiler gives back the
   * grid it was left showing rather than starting over every time.
   */
  public get lastGrid(): number {
    const stored = this.settings.getValue<number>("last-grid");
    const index = Number.isFinite(stored) ? Math.floor(stored) : 0;

    return index >= 0 && index < GRID_COUNT ? index : 0;
  }

  public set lastGrid(index: number) {
    this.settings.setValue("last-grid", index);
  }

  /** The grids the user has set up, in the order they appear. */
  public get presets(): Preset[] {
    const presets: Preset[] = [];

    for (let i = 1; i <= GRID_COUNT; i++) {
      presets.push(
        toPreset(
          this.settings.getValue<number>(`grid-${i}-cols`),
          this.settings.getValue<number>(`grid-${i}-rows`),
          this.settings.getValue<string>(`grid-${i}-layout`),
          this.settings.getValue<string>(`grid-${i}-name`),
          this.settings.getValue<string>(`grid-${i}-tooltip`),
        ),
      );
    }

    return presets;
  }

  public get hotkey(): string {
    return toKeybinding(this.rawHotkey);
  }

  public get reservedScope(): ReservedScope {
    return this.rawReservedScope === "primary" ? "primary" : "all";
  }

  public get showAutotile(): boolean {
    return toBoolean(this.rawShowAutotile);
  }

  public get centerOnWindow(): boolean {
    return toBoolean(this.rawCenterOnWindow);
  }

  public get windowFilter(): WindowFilter {
    return {
      dialogs: toBoolean(this.rawTileDialogs),
      toolboxes: toBoolean(this.rawTileToolboxes),
    };
  }

  public get gaps(): Gaps {
    return {
      window: toSize(this.rawWindowGap),
      edge: toSize(this.rawEdgeGap),
    };
  }

  public get reserved(): Reserved {
    return {
      top: toSize(this.rawReservedTop),
      bottom: toSize(this.rawReservedBottom),
      left: toSize(this.rawReservedLeft),
      right: toSize(this.rawReservedRight),
    };
  }

  public destroy(): void {
    this.settings.finalize();
  }
}
