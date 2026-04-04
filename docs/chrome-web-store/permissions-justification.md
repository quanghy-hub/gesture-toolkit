# Permissions Justification

## `storage`

Used to persist:

- Gesture settings
- Clipboard history and pinned items
- Quick Search preferences
- Excluded hosts

## `tabs`

Used to open new tabs from gesture actions and quick search actions, and to close the current tab for the double-right/double-tap gesture.

## `scripting`

Used to register and unregister content scripts dynamically so excluded hosts do not receive injected UI or listeners.

## Host permission: `"<all_urls>"`

Required because:

- Gestures operate on arbitrary HTTP/HTTPS pages chosen by the user.
- Clipboard and Quick Search UI can appear on user-selected pages, not on a fixed domain allowlist.
- Excluded hosts are enforced dynamically after registration.

Store privacy explanation should state clearly that the extension does not transmit browsing data to developer-controlled servers in this build.
