const jschardet = require("jschardet");
const fs = require("fs");
const { CompositeDisposable } = require("lumine");
const EncodingSelection = require("./encoding-selection");

module.exports = class EncodingListView {
  constructor(encodings, automaticEncodings = [], selectionModel = null) {
    this.encodings = encodings;
    this.disposables = new CompositeDisposable();
    this.selectionModel = selectionModel || new EncodingSelection(encodings, automaticEncodings);
    this.ownsSelectionModel = selectionModel == null;
    this.openGeneration = 0;
    this.destroyed = false;
    this.selectListHost = lumine.workspace.addSelectList(
      {
        itemsClassList: ["mark-active"],
        items: [],
        getItemId: (encoding) => encoding.id,
        search: { getFilterText: (encoding) => encoding.name },
        renderItem: (encoding, { highlight }) => {
          return {
            className: this.automatic
              ? encoding.id === "detect"
                ? "active"
                : encoding.id === this.currentEncoding
                  ? "auto-selected"
                  : null
              : encoding.id === this.currentEncoding
                ? "active"
                : null,
            primary: highlight(encoding.name),
            didRender: (element) => {
              element.dataset.encoding = encoding.id;
            },
          };
        },
        commands: {
          "encoding-selector:use-selected-encoding": {
            description: "Use the selected character encoding for the current file.",
            didDispatch: (event) => this.useEncoding(event.detail.item, event.detail.signal),
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
        this.openGeneration++;
        this.currentEncoding = null;
        this.editor = null;
      }),
    );
  }

  destroy() {
    this.destroyed = true;
    this.openGeneration++;
    this.currentEncoding = null;
    this.editor = null;
    this.disposables.dispose();
    if (this.ownsSelectionModel) this.selectionModel.destroy();
    return this.selectListHost.destroy();
  }

  serialize() {
    return this.selectionModel.serialize();
  }

  cancel() {
    this.selectListHost.cancel();
  }

  async toggle(editor = lumine.workspace.getActiveFileTextEditor()) {
    if (this.selectListHost.isVisible()) {
      this.cancel();
    } else if (editor) {
      const generation = ++this.openGeneration;
      this.editor = editor;
      this.currentEncoding = editor.getEncoding();
      const buffer = editor.getBuffer();
      this.automatic = this.selectionModel.isAutomatic(buffer);
      const encodingItems = [];

      const filePath = editor.getPath?.();
      if (filePath && fs.existsSync(filePath)) {
        encodingItems.push({ id: "detect", name: "Auto Detect" });
      }

      for (let id in this.encodings) {
        encodingItems.push({ id, name: this.encodings[id].list });
      }

      const initialId =
        this.automatic && encodingItems[0]?.id === "detect" ? "detect" : this.currentEncoding;

      await this.selectList.update({
        query: "",
        items: encodingItems,
        overflowSections: this.sectionsForCurrentEncoding(encodingItems),
        selection: {
          initial: encodingItems.some((item) => item.id === initialId)
            ? { id: initialId }
            : { mode: "first" },
        },
      });
      if (this.destroyed || editor.isDestroyed() || generation !== this.openGeneration) return;
      this.selectListHost.show();
    }
  }

  /**
   * When scrolling is needed, moves the current encoding under "Auto Detect" — or to
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

  async useEncoding(encoding, signal) {
    const editor = this.editor;
    const generation = this.openGeneration;
    if (!editor || editor.isDestroyed()) return;
    if (encoding.id === "detect") {
      await this.detectEncoding(editor, signal);
    } else {
      this.selectionModel.chooseManual(editor.getBuffer());
      editor?.setEncoding?.(encoding.id);
    }
    // Errors keep the picker open, so retain its captured editor for a retry.
    // A cancellation or a newer opening already replaced/cleared this context.
    if (this.editor === editor && generation === this.openGeneration) {
      this.editor = null;
      this.currentEncoding = null;
    }
  }

  async detectEncoding(editor = this.editor, signal) {
    const filePath = editor?.getPath?.();
    if (!filePath) throw new Error("Save the file before detecting its encoding.");
    const buffer = editor.getBuffer();
    const token = this.selectionModel.beginDetection(buffer);
    const contents = await fs.promises.readFile(filePath);
    if (
      this.destroyed ||
      signal?.aborted ||
      editor.isDestroyed() ||
      editor.getPath() !== filePath ||
      !this.selectionModel.isCurrent(buffer, token)
    )
      return;
    let { encoding } = jschardet.detect(contents) || {};
    if (encoding === "ascii") encoding = "utf8";

    // Auto records the last successful detection for this buffer. A manual
    // selection, even of the same value, clears that choice. Detection remains
    // explicit so unsaved edits never trigger another read of the disk file.
    const id = encoding?.toLowerCase().replace(/[^0-9a-z]|:\d{4}$/g, "");
    if (!this.encodings[id]) throw new Error("The file's encoding could not be detected.");
    editor.setEncoding(id);
    this.selectionModel.rememberAutomatic(buffer, id);
  }
};
