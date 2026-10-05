# encoding-selector

Pick the character encoding used for the current editor.

## Features

- **Encoding picker**: choose the encoding for the active editor from a searchable list.
- **Current encoding first**: when the list needs scrolling, the file's encoding sits under Auto Detect, ruled off from the rest; short lists keep their natural order.
- **Auto-detection**: defaults to Auto Detect with the configured file encoding, usually UTF-8; detects saved files on request and marks the automatic result with an italic icon until an encoding is chosen manually.
- **Status bar tile**: shows the active encoding and opens the picker when clicked.
- **Format-aware files**: keeps a fixed encoding visible but disables changing it when the file editor declares its encoding read-only.

## Installation

To install `encoding-selector` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/encoding-selector`.

## Commands

Commands available in `lumine-workspace`:

- `encoding-selector:show`: open the encoding picker for the current editor.

## Services

- `status-bar`: consumed to show the active encoding in the status bar.

File editors may implement `isEncodingReadOnly()` to keep their current encoding visible while preventing the picker from changing it. The command reports the fixed encoding instead of opening the picker.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
