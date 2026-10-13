const fs = require("fs");
const { CompositeDisposable } = require("lumine");
const EncodingSelection = require("./encoding-selection");

let detectorPromise;

function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = import("jschardet")
      .then((module) => module.default ?? module)
      .catch((error) => {
        detectorPromise = null;
        throw error;
      });
  }
  return detectorPromise;
}

module.exports = class EncodingListView {
  constructor(
    encodings,
    automaticEncodings = [],
    selectionModel = null,
    window = lumine.workspace.getMainWindow(),
  ) {
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
      { className: "encoding-selector", crumb: "Encodings", window },
    );
    this.selectList = this.selectListHost.getModel();
    this.disposables.add(
      this.selectListHost.onDidCancel(() => {
        this.openGeneration++;
        this.clearEditor();
      }),
    );
  }

  destroy() {
    this.destroyed = true;
    this.openGeneration++;
    this.clearEditor();
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

  clearEditor() {
    this.editorDestroySubscription?.dispose();
    this.editorDestroySubscription = null;
    this.currentEncoding = null;
    this.editor = null;
  }

  async toggle(editor = lumine.workspace.getActiveFileTextEditor()) {
    if (this.selectListHost.isVisible()) {
      this.cancel();
    } else if (editor) {
      const generation = ++this.openGeneration;
      this.clearEditor();
      this.editor = editor;
      this.editorDestroySubscription = editor.onDidDestroy(() => {
        this.openGeneration++;
        this.clearEditor();
        this.selectListHost.cancel();
      });
      this.currentEncoding = editor.getEncoding();
      const buffer = editor.getBuffer();
      this.automatic = this.selectionModel.isAutomatic(buffer);
      const encodingItems = [{ id: "detect", name: "Auto Detect" }];

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
      this.clearEditor();
    }
  }

  async detectEncoding(editor = this.editor, signal) {
    const filePath = editor?.getPath?.();
    if (!editor || editor.isDestroyed() || this.destroyed || signal?.aborted) return;
    const buffer = editor.getBuffer();
    if (!filePath || !fs.existsSync(filePath)) {
      const encoding = this.selectionModel.getDefaultEncoding(buffer);
      editor.setEncoding(encoding);
      this.selectionModel.rememberDefault(buffer);
      return;
    }
    const token = this.selectionModel.beginDetection(buffer);
    const generation = this.openGeneration;
    const isCurrent = () =>
      !this.destroyed &&
      !signal?.aborted &&
      !editor.isDestroyed() &&
      editor.getPath() === filePath &&
      generation === this.openGeneration &&
      this.selectionModel.isCurrent(buffer, token);
    const detector = await this.loadDetector();
    if (!isCurrent()) return;
    const contents = await fs.promises.readFile(filePath);
    if (!isCurrent()) return;
    let { encoding } = detector.detect(contents) || {};
    if (encoding === "ascii") encoding = "utf8";

    // Auto records the last successful detection for this buffer. A manual
    // selection, even of the same value, clears that choice. Detection remains
    // explicit so unsaved edits never trigger another read of the disk file.
    const id = encoding?.toLowerCase().replace(/[^0-9a-z]|:\d{4}$/g, "");
    if (!this.encodings[id]) throw new Error("The file's encoding could not be detected.");
    editor.setEncoding(id);
    this.selectionModel.rememberAutomatic(buffer, id);
  }

  loadDetector() {
    return loadDetector();
  }
};
