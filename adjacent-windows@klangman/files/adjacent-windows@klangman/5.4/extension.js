/*
 * extension.js
 * Copyright (C) 2024 Kevin Langman <klangman@gmail.com>
 *
 * Adjacent-Windows is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adjacent-Windows is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const GLib = imports.gi.GLib;

const Direction = {
  Left: 0,
  Right: 1,
  Up: 2,
  Down: 3,
  Under: 4,
  Back: 5
}

const Activate = {
   Closest: 0,
   HighestZ: 1,
   VisibleCorner: 2
}

const STACK_MIN_CAP = 50;    // Minimum stack capacity
const STACK_RESIZE  = 20;    // How many over capacity before resizing

function isAbove(a, b) {
   // user_time is the last time the window was interacted with, so the window with the greater user_time is closer to the foreground
   if (a.user_time > b.user_time) return true;
   return false;
}

class AdjacentWindows {
   constructor(metaData){
      this.meta = metaData;
      this.stack = [];
   }

   enable() {
      this.settings = new Settings.ExtensionSettings(this, this.meta.uuid);
      this.signalManager = new SignalManager.SignalManager(null);
      this.signalManager.connect(this.settings, "changed::left-key", this.updateHotkeys, this);
      this.signalManager.connect(this.settings, "changed::right-key", this.updateHotkeys, this);
      this.signalManager.connect(this.settings, "changed::up-key", this.updateHotkeys, this);
      this.signalManager.connect(this.settings, "changed::down-key", this.updateHotkeys, this);
      this.signalManager.connect(this.settings, "changed::under-key", this.updateHotkeys, this);
      this.signalManager.connect(this.settings, "changed::back-key", this.updateHotkeys, this);
      this.registerHotkeys();
   }

   disable() {
      this.removeHotkeys();
      this.signalManager.disconnectAllSignals();
   }

   updateHotkeys() {
      this.removeHotkeys();
      this.registerHotkeys();
   }

   getHotkeySequence(name) {
      let str = this.settings.getValue(name);
      if (str && str.length>0 && str != "::") {
         return str;
      }
      return null;
   }

   registerHotkeys() {
      this.leftCombo = this.getHotkeySequence("left-key");
      if (this.leftCombo) {
         Main.keybindingManager.addHotKey("adjacent-left", this.leftCombo, Lang.bind(this, function() {this.performHotkey(Direction.Left)} ));
      }
      this.rightCombo = this.getHotkeySequence("right-key");
      if (this.rightCombo) {
         Main.keybindingManager.addHotKey("adjacent-right" , this.rightCombo, Lang.bind(this, function() {this.performHotkey(Direction.Right)} ));
      }
      this.upCombo = this.getHotkeySequence("up-key");
      if (this.upCombo) {
         Main.keybindingManager.addHotKey("adjacent-up" , this.upCombo, Lang.bind(this, function() {this.performHotkey(Direction.Up)} ));
      }
      this.downCombo = this.getHotkeySequence("down-key");
      if (this.downCombo) {
         Main.keybindingManager.addHotKey("adjacent-down" , this.downCombo, Lang.bind(this, function() {this.performHotkey(Direction.Down)} ));
      }
      this.underCombo = this.getHotkeySequence("under-key");
      if (this.downCombo) {
         Main.keybindingManager.addHotKey("adjacent-under" , this.underCombo, Lang.bind(this, function() {this.performHotkey(Direction.Under)} ));
      }
      this.backCombo = this.getHotkeySequence("back-key");
      if (this.backCombo) {
         Main.keybindingManager.addHotKey("adjacent-back" , this.backCombo, Lang.bind(this, function() {this.performHotkey(Direction.Back)} ));
      }
   }

   removeHotkeys() {
      if (this.leftCombo) {
         Main.keybindingManager.removeHotKey("adjacent-left");
         this.leftCombo = null;
      }
      if (this.rightCombo) {
         Main.keybindingManager.removeHotKey("adjacent-right");
         this.rightCombo = null;
      }
      if (this.upCombo) {
         Main.keybindingManager.removeHotKey("adjacent-up");
         this.upCombo = null;
      }
      if (this.downCombo) {
         Main.keybindingManager.removeHotKey("adjacent-down");
         this.downCombo = null;
      }
      if (this.underCombo) {
         Main.keybindingManager.removeHotKey("adjacent-under");
         this.underCombo = null;
      }
      if (this.backCombo) {
         Main.keybindingManager.removeHotKey("adjacent-back");
         this.backCombo = null;
      }
   }

   pushStack(metaWindow) {
      if (this.stack.push(metaWindow) === (STACK_MIN_CAP+STACK_RESIZE)) {
         this.stack.splice(0, STACK_RESIZE);
      }
   }

   popStack(focusedWindow) {
      let poppedWindow = this.stack.pop();
      if (poppedWindow === focusedWindow) {
         return this.stack.pop();
      }
      return poppedWindow;
   }

   peekStack() {
      if (this.stack.length===0)
         return null;
      return this.stack[this.stack.length-1]
   }

   performHotkey(direction) {
      let focusedWindow = global.display.get_focus_window();
      if (direction === Direction.Back) {
         let newWindow = this.popStack(focusedWindow);
         if (newWindow) {
            this.activateWindow(newWindow);
         }
         return;
      }
      if (!focusedWindow || !Main.isInteresting(focusedWindow)) {
         return;
      }
      let focusedMonitor = focusedWindow.get_monitor();
      let focusedRec = focusedWindow.get_frame_rect();
      let currentWs = global.screen.get_active_workspace_index();
      let ws = global.screen.get_workspace_by_index(currentWs);
      let windows = ws.list_windows();
      if (windows.length > 1) {
         let nextFocusType = this.settings.getValue("next-focus");
         let newWindow;
         if (direction === Direction.Under) {
            // Since the behaviour of the "under" direction is the same in all configurations
            newWindow = this.getWindowUnder(focusedWindow, focusedRec, windows);
         } else if (nextFocusType === Activate.VisibleCorner) {
            newWindow = this.getClosestVisibleWindows(focusedWindow, focusedMonitor, focusedRec, windows, direction);
         } else if (nextFocusType === Activate.HighestZ){
            newWindow = this.getHighestZOrderWindow(focusedWindow, focusedMonitor, focusedRec, windows, direction);
         } else if (nextFocusType === Activate.Closest){
            newWindow = this.getClosestWindow(focusedWindow, focusedMonitor, focusedRec, windows, direction);
         }
         if (newWindow) {
            this.activateWindow(newWindow);
            if (this.peekStack() != focusedWindow)
               this.pushStack(focusedWindow);
            this.pushStack(newWindow);
         }
      }
      return;
   }

   activateWindow(window) {
      let warpPointer = this.settings.getValue("warp-cursor-pointer");

      Main.activateWindow(window);
      if (window.has_focus() && warpPointer) {
         let rec = window.get_frame_rect();
         let x = rec.x + rec.width / 2;
         let y = rec.y + rec.height / 2;
         global.set_pointer(x, y);
      }
   }

   // Find the window that is closes to the focused window in the direction requested
   // Does not take into account window visibility
   getClosestWindow(focusedWindow, focusedMonitor, focusedRec, windowList, direction) {
      let bestWindow = null;
      let bestRec = null;
      let allowMinimized = this.settings.getValue("include-minimized");
      let allowOtherMon  = this.settings.getValue("include-other-monitors");
      for (let i = 0; i < windowList.length; i++) {
         let metaWindow = windowList[i];
         if (metaWindow != focusedWindow && Main.isInteresting(metaWindow) &&
            (allowMinimized || !metaWindow.minimized) &&
            (allowOtherMon || focusedMonitor == metaWindow.get_monitor()))
         {
            let rec = metaWindow.get_frame_rect();
            if (direction == Direction.Left) {
               if (rec.x < focusedRec.x && (!bestWindow || rec.x > bestRec.x)) {
                  bestWindow = metaWindow;
                  bestRec = rec;
               }
            } else if (direction == Direction.Right) {
               if (rec.x > focusedRec.x && (!bestWindow || rec.x < bestRec.x)) {
                  bestWindow = metaWindow;
                  bestRec = rec;
               }
            } else if (direction == Direction.Up) {
               if (rec.y < focusedRec.y && (!bestWindow || rec.y > bestRec.y)) {
                  bestWindow = metaWindow;
                  bestRec = rec;
               }
            } else if (direction == Direction.Down) {
               if (rec.y > focusedRec.y && (!bestWindow || rec.y < bestRec.y)) {
                  bestWindow = metaWindow;
                  bestRec = rec;
               }
            }
         }
      }
      return bestWindow;
   }

   // Return the window that has the highest z-order and is in the direction requested from the focused window
   // This does not take into account the distance from the focused window
   getHighestZOrderWindow(focusedWindow, focusedMonitor, focusedRec, windowList, direction) {
      let bestWindow = null;
      let allowOtherMon  = this.settings.getValue("include-other-monitors");
      for (let i = 0; i < windowList.length; i++) {
         let metaWindow = windowList[i];
         if (metaWindow != focusedWindow && Main.isInteresting(metaWindow) && !metaWindow.minimized &&
            (allowOtherMon || focusedMonitor == metaWindow.get_monitor()))
         {
            let rec = metaWindow.get_frame_rect();
            if (direction == Direction.Left) {
               if (rec.x < focusedRec.x && (!bestWindow || isAbove(metaWindow, bestWindow))) {
                  bestWindow = metaWindow;
               }
            } else if (direction == Direction.Right) {
               if (rec.x > focusedRec.x && (!bestWindow || isAbove(metaWindow, bestWindow))) {
                  bestWindow = metaWindow;
               }
            } else if (direction == Direction.Up) {
               if (rec.y < focusedRec.y && (!bestWindow || isAbove(metaWindow, bestWindow))) {
                  bestWindow = metaWindow;
               }
            } else if (direction == Direction.Down) {
               if (rec.y > focusedRec.y && (!bestWindow || isAbove(metaWindow, bestWindow))) {
                  bestWindow = metaWindow;
               }
            }
         }
      }
      return bestWindow;
   }

   // Look for all windows that have some corner of their window in the direction of the direction parameter.
   // Sort the candidate list by z-order (descending user_time)
   // Return the window closes to the current window that still has a corner visible
   getClosestVisibleWindows(focusedWindow, focusedMonitor, focusedRec, windowList, direction) {
      let candidateList = [];
      let windowVisibilityList = [];
      let allowOtherMon  = this.settings.getValue("include-other-monitors");
      let zoneReductionPercent = this.settings.getValue("boost-restriction");
      let zoneReduction = Math.round( ((direction == Direction.Left || direction == Direction.Right)? focusedRec.height : focusedRec.width) * (zoneReductionPercent/100) / 2 );
      let cornerAllowance = this.settings.getValue("overlap-allowance");

      // Sort the list of windows in z-order (most recently focused is first in the list).
      windowList.sort(function(a, b) {return b.user_time - a.user_time;});

      // Create list of candidate windows and calculate window meta data.
      for (let i=0 ; i<windowList.length ; i++) {
         let metaWindow = windowList[i];
         if (Main.isInteresting(metaWindow) && !metaWindow.minimized &&
            (allowOtherMon || focusedMonitor == metaWindow.get_monitor()))
         {
            let rec = metaWindow.get_frame_rect();
            // overlapping: Does the window occupy any part of the same space as the focused window in the desired direction
            let idx = windowVisibilityList.push({window: metaWindow, rec: rec, cornerVisibility: null, overlapping: false}) - 1;
            if (metaWindow != focusedWindow) {
               if (direction == Direction.Left) {
                  if (rec.x < focusedRec.x) {
                     windowVisibilityList[idx].overlapping = (rec.y < focusedRec.y+focusedRec.height-zoneReduction && rec.y+rec.height > focusedRec.y+zoneReduction);
                     rec.width = Math.min(rec.width, focusedRec.x-1-rec.x);
                     if (rec.width >= cornerAllowance && rec.height >= cornerAllowance) {
                        windowVisibilityList[idx].cornerVisibility = this.getCornerVisibility( windowVisibilityList[idx], windowList, rec.x+cornerAllowance, rec.x+rec.width-cornerAllowance, rec.y+cornerAllowance, rec.y+rec.height-cornerAllowance );
                        candidateList.push(windowVisibilityList[idx]);
                     }
                  }
               } else if (direction == Direction.Right) {
                  if (rec.x+rec.width > focusedRec.x+focusedRec.width) {
                     windowVisibilityList[idx].overlapping = (rec.y < focusedRec.y+focusedRec.height-zoneReduction && rec.y+rec.height > focusedRec.y+zoneReduction);
                     let x2 = rec.x+rec.width;
                     rec.x = Math.max(rec.x, focusedRec.x+focusedRec.width+1);
                     rec.width = x2 - rec.x;
                     if (rec.width >= cornerAllowance && rec.height >= cornerAllowance) {
                        windowVisibilityList[idx].cornerVisibility = this.getCornerVisibility( windowVisibilityList[idx], windowList, rec.x+cornerAllowance, rec.x+rec.width-cornerAllowance, rec.y+cornerAllowance, rec.y+rec.height-cornerAllowance );
                        candidateList.push(windowVisibilityList[idx]);
                     }
                  }
               } else if (direction == Direction.Up) {
                  if (rec.y < focusedRec.y) {
                     windowVisibilityList[idx].overlapping = (rec.x < focusedRec.x+focusedRec.width-zoneReduction && rec.x+rec.width > focusedRec.x+zoneReduction)
                     rec.height = Math.min(rec.height, focusedRec.y-1-rec.y);
                     if (rec.width >= cornerAllowance && rec.height >= cornerAllowance) {
                        windowVisibilityList[idx].cornerVisibility = this.getCornerVisibility( windowVisibilityList[idx], windowList, rec.x+cornerAllowance, rec.x+rec.width-cornerAllowance, rec.y+cornerAllowance, rec.y+rec.height-cornerAllowance );
                        candidateList.push(windowVisibilityList[idx]);
                     }
                  }
               } else if (direction == Direction.Down) {
                  if (rec.y+rec.height > focusedRec.y+focusedRec.height) {
                     windowVisibilityList[idx].overlapping = (rec.x < focusedRec.x+focusedRec.width-zoneReduction && rec.x+rec.width > focusedRec.x+zoneReduction)
                     let y2 = rec.y+rec.height;
                     rec.y = Math.max(rec.y, focusedRec.y+focusedRec.height+1);
                     rec.height = y2 - rec.y;
                     if (rec.width >= cornerAllowance && rec.height >= cornerAllowance) {
                        windowVisibilityList[idx].cornerVisibility = this.getCornerVisibility( windowVisibilityList[idx], windowList, rec.x+cornerAllowance, rec.x+rec.width-cornerAllowance, rec.y+cornerAllowance, rec.y+rec.height-cornerAllowance );
                        candidateList.push(windowVisibilityList[idx]);
                     }
                  }
               }
            }
         }
      }
      // If there are any candidate windows find the best one
      if (candidateList.length > 1) {
         // Find the closest window that has at least one corner visible
         // When two windows are the same distance, use the highest z-order window
         // The 1st entry in the candidate list will be the highest z-order and for sure visible
         let bestWindow = null;
         let bestWindowOffset;
         for (let i=0 ; i < candidateList.length ; i++) {
            let candidate = candidateList[i];
            let visibleCorner = (candidate.cornerVisibility.topLeft || candidate.cornerVisibility.bottomLeft || candidate.cornerVisibility.topRight || candidate.cornerVisibility.bottomRight);
            let candidateIsBetter = (!bestWindow || (candidate.overlapping && !bestWindow.overlapping));
            /*
            log( `Candidate[${i}]: "${candidate.window.get_title()}"` );
            if (candidate.cornerVisibility.topLeft && candidate.cornerVisibility.topRight) {
               log( `                 ${candidate.cornerVisibility.topLeft.x},${candidate.cornerVisibility.topLeft.y}, ${candidate.cornerVisibility.topRight.x},${candidate.cornerVisibility.topRight.y}`);
            } else if (candidate.cornerVisibility.topLeft) {
               log( `                 ${candidate.cornerVisibility.topLeft.x},${candidate.cornerVisibility.topLeft.y}, Null`);
            } else if (candidate.cornerVisibility.topRight) {
               log( `                 Null, ${candidate.cornerVisibility.topRight.x},${candidate.cornerVisibility.topRight.y}`);
            } else {
               log( "                 Null, Null" );
            }
            if (candidate.cornerVisibility.bottomLeft && candidate.cornerVisibility.bottomRight) {
               log( `                 ${candidate.cornerVisibility.bottomLeft.x},${candidate.cornerVisibility.bottomLeft.y}, ${candidate.cornerVisibility.bottomRight.x},${candidate.cornerVisibility.bottomRight.y}`);
            } else if (candidate.cornerVisibility.bottomLeft) {
               log( `                 ${candidate.cornerVisibility.bottomLeft.x},${candidate.cornerVisibility.bottomLeft.y}, Null`);
            } else if (candidate.cornerVisibility.bottomRight) {
               log( `                 Null, ${candidate.cornerVisibility.bottomRight.x},${candidate.cornerVisibility.bottomRight.y}`);
            } else {
               log( "                 Null, Null" );
            } */

            if (visibleCorner && (!bestWindow || !bestWindow.overlapping || candidate.overlapping)) {
               if (direction == Direction.Left) {
                  if (candidate.cornerVisibility.topRight || candidate.cornerVisibility.bottomRight) {
                     if (candidateIsBetter || (candidate.overlapping == bestWindow.overlapping && candidate.rec.x+candidate.rec.width > bestWindowOffset)) {
                        bestWindow = candidate;
                        bestWindowOffset = candidate.rec.x+candidate.rec.width;
                     }
                  } else {
                     if (candidateIsBetter || (candidate.overlapping == bestWindow.overlapping && candidate.rec.x > bestWindowOffset)) {
                        bestWindow = candidate;
                        bestWindowOffset = candidate.rec.x;
                     }
                  }
               } else if (direction == Direction.Right) {
                  if (candidate.cornerVisibility.topLeft || candidate.cornerVisibility.bottomLeft) {
                     if (candidateIsBetter || (candidate.overlapping == bestWindow.overlapping && candidate.rec.x < bestWindowOffset)) {
                        bestWindow = candidate;
                        bestWindowOffset = candidate.rec.x;
                     }
                  } else {
                     if (candidateIsBetter || (candidate.overlapping == bestWindow.overlapping && candidate.rec.x+candidate.rec.width < bestWindowOffset)) {
                        bestWindow = candidate;
                        bestWindowOffset = candidate.rec.x+candidate.rec.width;
                     }
                  }
               } else if (direction == Direction.Up) {
                  if (candidate.cornerVisibility.bottomLeft || candidate.cornerVisibility.bottomRight) {
                     if (candidateIsBetter || (candidate.overlapping == bestWindow.overlapping && candidate.rec.y+candidate.rec.height > bestWindowOffset)) {
                        bestWindow = candidate;
                        bestWindowOffset = candidate.rec.y+candidate.rec.height;
                     }
                  } else {
                     if (candidateIsBetter || (candidate.overlapping == bestWindow.overlapping && candidate.rec.y > bestWindowOffset)) {
                        bestWindow = candidate;
                        bestWindowOffset = candidate.rec.y;
                     }
                  }
               } else if (direction == Direction.Down) {
                  if (candidate.cornerVisibility.topLeft || candidate.cornerVisibility.topRight) {
                     if (candidateIsBetter || (candidate.overlapping == bestWindow.overlapping && candidate.rec.y < bestWindowOffset)) {
                        bestWindow = candidate;
                        bestWindowOffset = candidate.rec.y;
                     }
                  } else {
                     if (candidateIsBetter || (candidate.overlapping == bestWindow.overlapping && candidate.rec.y+candidate.rec.height < bestWindowOffset)) {
                        bestWindow = candidate;
                        bestWindowOffset = candidate.rec.y+candidate.rec.height;
                     }
                  }
               }
            }
         }
         if (bestWindow)
            return bestWindow.window;
      } else if (candidateList.length == 1){
         return candidateList[0].window;
      }
      return null;
   }

   // Calculate the visibility of the corners for the 'window' parm.
   // The passed in window coordinates exclude any portion of the window that is covered by the focused window
   // Assumes the windowList parm is in z-order with focused window at index 0
   // Returns an object with the visibility of the four corners
   getCornerVisibility(window, windowList, x, x2, y, y2) {
      let cornerVisibility = {topLeft: {x:x,y:y}, topRight: {x:x2,y:y}, bottomLeft: {x:x,y:y2}, bottomRight: {x:x2,y:y2}};
      for (let i = 0 ; windowList[i] != window.window ; i++) {
         let metaWindow = windowList[i];
         if (!Main.isInteresting(metaWindow) || metaWindow.minimized)
            continue;
         let rec = metaWindow.get_frame_rect();
         let cx = rec.x;
         let cy = rec.y;
         let cx2 = rec.x+rec.width;
         let cy2 = rec.y+rec.height;
         // Null out corners that are covered
         if (cx <= x && cx2 >= x && cy <= y && cy2 >= y) {
            cornerVisibility.topLeft = null;
         }
         if (cx <= x2 && cx2 >= x2 && cy <= y && cy2 >= y) {
               cornerVisibility.topRight = null;
         }
         if (cx <= x && cx2 >= x && cy <= y2 && cy2 >= y2) {
            cornerVisibility.bottomLeft = null;
         }
         if (cx <= x2 && cx2 >= x2 && cy <= y2 && cy2 >= y2) {
            cornerVisibility.bottomRight = null;
         }
      }
      return cornerVisibility;
   }

   // Find the window with the highest z-index that overlaps with the current focused window.
   // If this method is called a 2nd time within 2sec, then return the window that is next lowest
   // in z-order below the focusedWindow from the 1st call.
   getWindowUnder(focusedWindow, focusedRec, windows) {
      let i=0;
      windows.sort(function(a, b) {return b.user_time - a.user_time;});
      if (this.lastUnderWindow) {
         // Since the Under key-combo was hit again within 2 sec, we will go to the next highest window rather than cycling between just two windows!
         focusedWindow = this.lastUnderWindow;
         focusedRec = focusedWindow.get_frame_rect();
         i = windows.indexOf(focusedWindow);
      }
      let fy2 = focusedRec.y+focusedRec.height;
      let fx2 = focusedRec.x+focusedRec.width;
      for ( ; i < windows.length ; i++ ){
         let metaWindow = windows[i];
         if (metaWindow != focusedWindow && Main.isInteresting(metaWindow) && !metaWindow.minimized) {
            let rec = metaWindow.get_frame_rect();
            let y2 = rec.y+rec.height;
            let x2 = rec.x+rec.width;
            if (rec.x < fx2 && x2 > focusedRec.x && rec.y < fy2 && y2 > focusedRec.y) {
               if (this.underDelay) {
                  let doIt = GLib.MainContext.default().find_source_by_id(this.underDelay);
                  if (doIt) Mainloop.source_remove(this.underDelay);
               }
               this.lastUnderWindow = focusedWindow;
               this.underDelay = Mainloop.timeout_add(3000, () => { this.underDelay = null; this.lastUnderWindow = null;  });
               return metaWindow;
            }
         }
      }
      return null;
   }
}

let extension = null;
function enable() {
	extension.enable();
}

function disable() {
	extension.disable();
	extension = null;
}

function init(metadata) {
	if(!extension) {
		extension = new AdjacentWindows(metadata);
	}
}