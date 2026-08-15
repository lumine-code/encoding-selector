# encoding-selector

Pick the character encoding used for the current editor.

## Features

- **Encoding picker**: choose the encoding for the active editor from a searchable list.
- **Current encoding first**: the file's own encoding sits under Auto Detect, ruled off from the rest.
- **Auto-detection**: detects the likely encoding of the current file.
- **Status bar tile**: shows the active encoding and opens the picker when clicked.

## Installation

To install `encoding-selector` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/encoding-selector`.

## Commands

Commands available in `lumine-workspace`:

- `encoding-selector:show`: open the encoding picker for the current editor.

## Services

- `status-bar`: consumed to show the active encoding in the status bar.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
