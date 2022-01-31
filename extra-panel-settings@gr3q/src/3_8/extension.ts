import { Config } from "./config";

const { panelManager } = imports.ui.main;

export class Extension {

  originalPanelStyles: string[] = [];
  enabled: boolean = false;
  settings: Config;
  panelsChangedKey: number | null = null;

  constructor() {
    this.settings = new Config(this);
  }

  Enable() {
    this.enabled = true;
    this.settings.Enable();
    this.UpdateCurrentFont();
    this.panelsChangedKey = global.settings.connect("changed::panels-enabled", () => {
      global.log("Panels changed")
      this.UpdateCurrentFont();
    });
  }

  Disable() {
    this.settings.Disable();
    this.CleanupCurrentFont();
    if (this.panelsChangedKey != null) {
      global.settings.disconnect(this.panelsChangedKey);
      this.panelsChangedKey = null;
    }
  }

  UpdateCurrentFont = () => {
    if (this.settings.PanelFont == null) {
      this.CleanupCurrentFont();
    }
    else {
      for (const panel of panelManager.getPanels()) {
        if (panel == null)
          continue;
        
        // Backup original styles the first time we plan to modify the panel
        if (this.originalPanelStyles[panel.panelId] == null) {
          this.originalPanelStyles[panel.panelId] = panel.actor.style;
        }
        
        panel.actor.style = (this.originalPanelStyles[panel.panelId] ?? "") + `font-family: ${this.settings.PanelFont};`
      }
    }
  }

  CleanupCurrentFont = () => {
    for (const panel of panelManager.getPanels()) {
      if (panel == null)
        continue;
      panel.actor.style = this.originalPanelStyles[panel.panelId]
    }
    this.originalPanelStyles = [];
  }
}

/*****************************************************************
                            FUNCTIONS
*****************************************************************/

let app!: Extension; 

export const init = (meta: any) => {
  app = new Extension();
}

export const enable = () => {
  app.Enable();
}

export const disable = () => {
  // Key Bindings
  app.Disable()
}