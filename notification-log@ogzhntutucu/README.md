# Notification Log

Cinnamon keeps notification history only in memory: it is gone after you clear it,
log out or restart Cinnamon. This extension keeps a persistent log of **every**
notification, as one JSON line per notification in
`~/.local/state/notifications/YYYY-MM.jsonl`.

- Logs notifications from apps (over D-Bus) and from Cinnamon itself (system
  messages, network agent, applets), which never go over D-Bus.
- Logs notifications that arrive while notifications are turned off.
- Private apps and sites: if an entry matches the sender's name or the body, only
  the time and app are logged; the body is replaced with `[hidden]`, and so is the title
  unless you untick "Hide title too" for that entry (messengers put the sender's name in
  the title). Matching
  the body covers browser notifications, which show the site there. Defaults: Discord,
  Telegram, Signal, WhatsApp.
- Monthly files are deleted once the whole month is older than the retention period
  (default 90 days, 0 keeps everything).

## Settings

- **History**: browse logged notifications, newest first, with search. The Apps button
  lists every app with its notification count; untick noisy apps to hide them from the
  list (they are still logged). Unticked apps are remembered, and apps seen for the
  first time always show up. Hover a row to see the full text. Right-click a row to copy its text, hide
  that app or site from now on (optionally hiding the text of records already logged),
  or delete the record.
- **Privacy**: the list of private apps and sites.
- **Storage**: retention period, open the log folder, or delete all logs.

The log is plain text in your home folder (`~/.local/state` is where the XDG spec puts
history and logs), readable only by you, like your shell or browser history. Use the
private list for apps whose notifications contain messages.

Example line:

```json
{"time":"2026-10-13T20:02:14.533585+03","source":"Firefox","app":"firefox.desktop","pid":4242,"internal":false,"title":"Download complete","body":"file.zip","urgency":"normal","transient":false,"update":false}
```

`internal` is true for Cinnamon's own notifications, `update` is true when an existing
notification was updated (same id). Read it with `jq`, `grep`, or any JSON tool.

## How it works

Every notification goes through `MessageTray.Source.prototype.notify()` in
`js/ui/messageTray.js`, before the "display notifications" switch is checked. The
extension wraps that function (and `Notification.update()` to keep the plain body text)
and appends the line asynchronously, so Cinnamon is never blocked. Errors in logging
never stop the notification. Disabling the extension restores the original functions;
existing logs are kept. Reading, deleting and redacting records happens in the
settings window (`settings.py`), never inside Cinnamon.
