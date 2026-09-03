const jschardet = require("jschardet");
const fs = require("fs");
const { CompositeDisposable } = require("lumine");

module.exports = class EncodingListView {
  constructor(encodings) {
    this.encodings = encodings;
    this.disposables = new CompositeDisposable();
    this.selectListHost = lumine.workspace.addSelectList(
      {
        itemsClassList: ["mark-active"],
        items: [],
        getItemId: (encoding) => encoding.id,
        search: { getFilterText: (encoding) => encoding.name },
        renderItem: (encoding, { highlight }) => {
          return {
            className: encoding.id === this.currentEncoding ? "active" : null,
            primary: highlight(encoding.name),
            didRender: (element) => {
              element.dataset.encoding = encoding.id;
            },
          };
        },
        commands: {
          "encoding-selector:use-selected-encoding": {
            description: "Use the selected character encoding for the current file.",
            didDispatch: (event) => this.useEncoding(event.detail.item),
          },
        },
        actions: [
          {
            command: "encoding-selector:use-selected-encoding",
            context: "item",
            primary: true,
            disposition: "close",
          },
        ],
      },
      { className: "encoding-selector", crumb: "Encodings" },
    );
    this.selectList = this.selectListHost.getModel();
    this.disposables.add(
      this.selectListHost.onDidCancel(() => {
        this.currentEncoding = null;
      }),
    );
  }

  destroy() {
    this.currentEncoding = null;
    this.disposables.dispose();
    return this.selectListHost.destroy();
  }

  cancel() {
    this.selectListHost.cancel();
  }

  async toggle() {
    if (this.selectListHost.isVisible()) {
      this.cancel();
    } else if (lumine.workspace.getActiveFileTextEditor()) {
      const editor = lumine.workspace.getActiveFileTextEditor();
      this.currentEncoding = editor.getEncoding();
      const encodingItems = [];

      if (fs.existsSync(editor.getPath())) {
        encodingItems.push({ id: "detect", name: "Auto Detect" });
      }

      for (let id in this.encodings) {
        encodingItems.push({ id, name: this.encodings[id].list });
      }

      await this.selectList.update({
        sections: this.sectionsForCurrentEncoding(encodingItems),
      });
      this.selectListHost.show();
    }
  }

  /**
   * Moves the file's current encoding directly under "Auto Detect" — or to
   * the top when the file is unsaved and there is no "Auto Detect" row — so
   * the head of the list is what the picker was opened over.
   * @param {Array} items - The encoding rows
   * @returns {Array} Sections that keep the opening choices together
   */
  sectionsForCurrentEncoding(items) {
    const head = items[0]?.id === "detect" ? 1 : 0;
    const index = items.findIndex((encoding) => encoding.id === this.currentEncoding);
    if (index < head) return [{ id: "encodings", items }];
    const ordered = items.slice();
    const [current] = ordered.splice(index, 1);
    ordered.splice(head, 0, current);
    const boundary = head + 1;
    if (boundary >= ordered.length) return [{ id: "encodings", items: ordered }];
    return [
      { id: "current", items: ordered.slice(0, boundary) },
      { id: "available", items: ordered.slice(boundary) },
    ];
  }

  useEncoding(encoding) {
    if (encoding.id === "detect") {
      this.detectEncoding();
    } else {
      lumine.workspace.getActiveFileTextEditor().setEncoding(encoding.id);
    }
    this.currentEncoding = null;
  }

  detectEncoding() {
    const editor = lumine.workspace.getActiveFileTextEditor();
    const filePath = editor.getPath();
    if (fs.existsSync(filePath)) {
      fs.readFile(filePath, (error, buffer) => {
        if (!error) {
          let { encoding } = jschardet.detect(buffer) || {};
          if (encoding === "ascii") {
            encoding = "utf8";
          }

          // Only switch to an encoding this picker actually offers (its ids are
          // defined in main.js and passed in as `this.encodings`).
          const id = encoding.toLowerCase().replace(/[^0-9a-z]|:\d{4}$/g, "");
          if (this.encodings[id]) {
            editor.setEncoding(id);
          }
        }
      });
    }
  }
};
