# Curtain Extension for Cinnamon

## Table Of Contents

- [A. Introduction](#a-introduction)
- [B. Get Started](#b-get-started)
- [C. Features](#c-features)
- [D. Half Window Manager](#d-half-window-manager)
- [E. Installation](#e-Installation)

## A. Introduction

The **Curtain** extension for Cinnamon is designed to be a lightweight,fast and easy to install and configure alternative to popular window managers. Essentially, it is aimed to completely navigate workspaces and windows using only the keyboard.
![Curtain screenshot](screenshot.png)

## B. Get Started

### 1. Applications

Due to individual windows not following **Curtain** rules ,it is advisable the following applications are preferred:

- kitty over gnome-terminal

### 2. KeyBindings

While you can set up your own keybindings as you like by going to Extension -> Settings(Curtain), one of the settings that can help you get started quickly is as follows:

- **Switch Workspaces** : `Super + 1-9`
- **Move Windows To A Workspace** : `Super+Shift+1-9`
- **Navigate between next and previous workspaces** : `Super + R/T` for switching and`Super + Shift + R/T` and for moving focused window (R for previous and T for next workspace)
- **Arrange the Windows** : `Super + Tab`
- **Focus the window** : `Super + F`
- **Move the window** : `Super + M`
- **Swap the window** : `Super + S`
- **Half Screen** : `Super + H`
- **Maximize**: `Super + L`
- **Exit from Maximize**: `Super+Q`
- **Minimize** : `Super + P`
- **Close the Focused Window** : `Super+K`
- **Enable/disable**: `Super + Escape`

### 3. Configure your own additional hotkeys

- To open an application like kitty,Nemo etc. you can go to System Settings > Keyboard > Shortcuts > Custom Shortcuts

## C. Features

### 1. Workspace Management

- **Switch workspaces**: Switch between workspaces
- **Move Windows To A Workspace**: Move the <b>focused</b> window to any workspaces
- **Navigate between next and previous workspaces**: Alternatively it is possible to move to previous and next workspaces and move the windows to previous and next workspaces

### 2. Window Management

- **Arrange the Windows**: Arrange the windows in [Half Window Fashion](#half-window-manager)
- **Focus the window** : focus on [next window](#next-window-in-half-window-manager)
- **Move the window** : Move the <b>focused</b> window in direction of the largest window equal or less than the focused window
- **Swap the window**: Swap the <b>focused</b> window with the [next window](#next-window-in-half-window-manager)
- **Half Screen**: Make the <b>focused</b> window occupy left half of the screen and arrange the rest of the windows
- **Maximize**: Make the <b>focused</b> window occupy whole screen/maximize using `Super+L`
- **Exit from Maximize**: Unmaximize the <b>focused</b> window
- **Minimize**: Minimize the <b>focused</b> window
- **Close the Focused Window**: Close the <b>focused</b> window

### 3. Other Settings

- **Enable/disable**: Automatic arrangement on opening/closing a window as well as Hotkeys can be toggled on/off using `Super + Escape`
- **Cycling and Appending** : Choose whether you want to cycle through your existing workspaces on **Navigate between next and previous workspaces** or append new workspaces at end or neither

### 4. Automatic Arrangement

- If the windows are in arranged fashion i.e no sizing and position of any window is changed, then the newly opened windows also open in [Half Window Fashion](#half-window-manager).
- **Note - this is only possible when the windows themselves allow resizing and positioning. If any of the opened windows(newly opened or already opened) cannot resize or position itself according to the algorithm, the automatic arrangement fails and windows are opened/resized randomly. This is especially true for applications like gnome-terminal which only resizes itself vertically in multiple of font size and winddows having a set minimum size."**

<!-- ### See the applet status
- See whether the extension is enabled or not, current workspace index, as well as total workspaces
![screenshot for panel](screenshot.png) -->

### 5. Fully customizable

- The keys for performing all the action are fully customizable

## D. Half Window Manager

The **Curtain** extension arranges the windows using the following rules:

- Sort the windows by their size. If two windows are of same size the one that is on left or top comes first
- Windows are arranged starting from the full screen
- Arrange the 1st window in half screen either vertically(top or bottom) or horizontally(left or right) depending upon whether the remaining area has lower width(vertically) or lower height(horizontally)

### 1. Next Window in Half Window Manager

- The focus and swap operations in **Curtain** are performed using the current focused window and the next window. The next window is the largest area window which is equal or smaller than the focused window. If no such window exists the next window is the largest area window

## E. Installation

### 1. Manual Installation for Extension

To manually install the **Curtain** extension in Cinnamon, follow the steps below:
**1. Navigate to the Cinnamon extension directory:**
Open the terminal and use the `cd` command to go to the folder where Cinnamon extensions are stored locally:

```bash
cd ~/.local/share/cinnamon/extensions
```

**2. Clone the extensions repository:**
Clone the repository using the following command:

```bash
git clone git@github.com:AdvaitaSoni/curtain.git curtain@AdvaitaSoni
```

**3. Restart Cinnamon:**
For Cinnamon to recognize the new extension, you can restart the graphical environment. The easiest way is to press `Alt + F2`, type `r`, and press `Enter`. This will restart Cinnamon without closing your applications.

**4. Enable the extension :**

- Search for Extension
- Go to Manage Tab
- Click on \*\*curtain@AdvaitaSoni```
- Click on "+" icon at the bottom to enable the extension

### 2. Official Download

- Download the official version by going to Extensions in Settings -> Download Tab -> curtain@AdvaitaSoni -> enable the extension in Manage tab

### 3. Manual Installation for Applet

To manually install the **Curtain** applet in Cinnamon(not officially supported), follow the steps below:
**1. Navigate to the Cinnamon applet directory:**
Open the terminal and use the `cd` command to go to the folder where Cinnamon applets are stored locally:

```bash
cd ~/.local/share/cinnamon/applets
```

**2. Clone the extensions repository:**
Clone the repository using the following command:

```bash
git clone git@github.com:AdvaitaSoni/curtain.git -b APPLET curtain@AdvaitaSoni #NOTE THAT YOU HAVE TO CLONE APPLET BRANCH
```

**3. Restart Cinnamon (or the panel):**
For Cinnamon to recognize the new extension, you can restart the graphical environment. The easiest way is to press `Alt + F2`, type `r`, and press `Enter`. This will restart Cinnamon without closing your applications.

**4. Add the Applet :**

- Right-Click on Panel and choose `Applets` or search for them in settings
- Go to Manage Tab
- Click on \*\*curtain@AdvaitaSoni```
- Click on "+" icon at the bottom to enable the applet
