### Extended Description
This extension improves the user experience when switching keyboard layouts in Cinnamon. Instead of relying solely on the tray indicator, it displays a clean, modern modal popup in the corner of the screen immediately after the layout changes. 

The popup fades out automatically after a short delay, providing clear visual feedback without interrupting the user's workflow.

### Technical Details & Implementation
- **Triggers:** Listens to the keyboard layout change signals via Cinnamon/GObject API.
- **UI Component:** Uses St (Shell Toolkit) to create a native modal dialog boxed container.
- **Compatibility:** Tailored for Cinnamon 6.0+ and tested to ensure it doesn't conflict with default system OSD notifications.

### How to Test
1. Enable the extension in System Settings -> Extensions.
2. Change your keyboard layout using your preferred shortcut (e.g., Super+Space or Alt+Shift).
3. Verify that a modal popup appears with the correct layout indicator and smoothly disappears.
