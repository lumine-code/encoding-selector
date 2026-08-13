const jschardet = require("jschardet");
const fs = require("fs");

module.exports = class EncodingListView {
  constructor(encodings) {
    this.encodings = encodings;
    this.selectListView = lumine.workspace.buildSelectList({
      className: "encoding-selector",
      crumb: "Encodings",
      itemsClassList: ["mark-active"],
      items: [],
      filterKeyForItem: (encoding) => encoding.name,
      elementForItem: (encoding, { highlight }) => {
        const element = document.createElement("li");
        if (encoding.id === this.currentEncoding) {
          element.classList.add("active");
        }
        element.appendChild(highlight(encoding.name));
        element.dataset.encoding = encoding.id;
        return element;
      },
      didConfirmSelection: (encoding) => {
        this.cancel();
        if (encoding.id === "detect") {
          this.detectEncoding();
        } else {
          lumine.workspace.getActiveFileTextEditor().setEncoding(encoding.id);
        }
      },
      didCancelSelection: () => {
        this.cancel();
      },
    });
  }

  destroy() {
    this.cancel();
    return this.selectListView.destroy();
  }

  cancel() {
    this.currentEncoding = null;
    this.selectListView.hide();
  }

  async toggle() {
    if (this.selectListView.isVisible()) {
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

      this.selectListView.reset();
      await this.selectListView.update({ items: encodingItems });
      this.selectListView.show();
    }
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
