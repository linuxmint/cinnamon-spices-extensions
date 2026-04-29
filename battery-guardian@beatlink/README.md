# Battery Guardian

**Battery Guardian** is a robust power-management applet for the Cinnamon Desktop Environment. It acts as a final safety net for your work, ensuring you never lose data due to an unexpected battery death.

Unlike standard system notifications that are easily missed, Battery Guardian provides a clear, persistent countdown when your battery reaches a critical level, giving you ample time to save your progress or plug in your charger.

---

## Demo

![Demo Video](./BatteryGuardian.mp4)

---

## Key Features

* **Two-Stage Warning System** :

  * **Main Dialog** : A focused modal window that demands your attention when the battery hits the threshold.
  * **Floating Guardian** : If you choose to keep working, a non-intrusive floating window stays on top of all other windows (even in fullscreen) to keep you aware of the remaining time.
* **Intelligent Cancellation** : The moment you plug in your AC adapter, all warnings and countdowns automatically disappear and the scheduled action is cancelled.
* **Customizable Battery Level** : You can set what battery percentage will trigger the countdown sequence. For best results, set it to a percentage higher than the built in low battery action level.
* **Customizable Duration** : You can set how long the countdown will last before action is taken
* **Customizable Actions** : Choose whether the system should  **Shut Down** ,  **Suspend** , or  **Hibernate** .
* **Test Mode** : Safely verify the UI and timing without actually shutting down your computer.

---

## Settings & Configuration

You can find these options in the **Applet Settings** (Right-click the applet in the panel > Configure):

| Setting                      | Description                                                                            | Default     |
| ---------------------------- | -------------------------------------------------------------------------------------- | ----------- |
| **Battery Threshold**  | The percentage (%) at which the warning will trigger.                                  | `10%`     |
| **Action**             | What to do when time runs out (Power Off, Suspend, or Hibernate).                      | `Suspend` |
| **Countdown Duration** | How many seconds you have to react before the action is forced.                        | `120s`    |
| **Test Mode**          | If enabled, the dialog will count down normally, but**no action** will be taken. | `Off`     |

---

## Important Note on Hibernation

The **Hibernate** option is powerful because it saves your exact session to the hard drive, but **it is not supported by all Linux installations by default.**

Before selecting Hibernate as your default action, please verify your system supports it:

1. Open a terminal.
2. Run the command: `systemctl hibernate`
3. **If your computer does not turn off and successfully resume your session exactly where you left off, do not use this setting.**

> **Why?** Hibernation requires a swap partition or swap file that is at least as large as your RAM. If this isn't configured correctly, the command may fail, leaving your laptop to die ungracefully. If in doubt, use **Suspend (Sleep)** or  **Power Off** .

---

## Installation

### Method 1: Cinnamon Applet Download (Easiest)

1. Right-click your Cinnamon panel and select  **Add Applets to the Panel** .
2. Click the **Download** tab and click "Yes" to update the cache.
3. Search for  **Battery Guardian** .
4. Click the **Download icon** next to it.
5. Switch back to the **Manage** tab, select Battery Guardian, and click the **(+) Add** button.

### Method 2: Manual Installation

1. Create a folder named exactly `battery-guardian@beatlink`.
2. Place `applet.js`, `metadata.json`, and `settings-schema.json` inside that folder.
3. Move the folder to: `~/.local/share/cinnamon/applets/`
4. Restart Cinnamon (Press `Alt+F2`, type `r`, and hit `Enter`).
5. Enable the applet via the **Applets** system settings.

---

## How it Works

When your battery drops below your defined threshold:

1. A **Main Dialog** appears with the option:  **"Save Unfinished Work"** .
2. Clicking that button transforms the warning into a **small floating window** in the bottom-right corner.
3. This allows you to quickly save your files while watching the timer.
4. If the timer reaches  **0** , the system executes your chosen command (e.g., `systemctl suspend`).
5. **Plugging in power at any time kills the timer and dismisses the UI immediately.**

---

*Developed by BeatLink with AI assistance*

*[Icon created by Pop Vectors - Flaticon](https://www.flaticon.com/authors/pop-vectors)*
