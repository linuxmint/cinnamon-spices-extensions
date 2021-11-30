import { ToggleSettingsButton } from "./ToggleSettingsButton";

export class ToggleSettingsButtonListener {
    actors: ToggleSettingsButton[] = [];
  
    constructor() { }
  
    public addActor(actor: ToggleSettingsButton) {
      actor.connect(
        'update-toggle',
        this._updateToggle
      );
      this.actors.push(actor);
    }
  
    public _updateToggle = () => {
      for (let actorIdx in this.actors) {
        let actor = this.actors[actorIdx];
        actor["_update"]();
      }
    }
  };