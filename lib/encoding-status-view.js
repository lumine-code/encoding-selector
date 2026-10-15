const { Disposable } = require("lumine");

module.exports = class EncodingStatusView {
  constructor(statusBar, encodings, { isEncodingReadOnly, readOnlyEncodingMessage, context }) {
    this.destroyed = false;
    this.statusBar = statusBar;
    this.editorContainer = context?.editorContainer ?? lumine.workspace;
    this.presentation = context?.window ?? lumine.workspace.getMainWindow();
    this.encodings = encodings;
    this.isEncodingReadOnly = isEncodingReadOnly;
    this.readOnlyEncodingMessage = readOnlyEncodingMessage;
    this.element = this.presentation.getDocument().createElement("status-bar-tile");
    this.element.classList.add("encoding-status");
    this.element.setAttribute("data-context-menu-boundary", "");

    try {
      this.initialize();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  initialize() {
    this.activeItemSubscription = this.editorContainer.observeActiveFileTextEditor(
      this.subscribeToActiveTextEditor.bind(this),
    );
    const clickHandler = (event) => {
      if (event.button !== 0 || (process.platform === "darwin" && event.ctrlKey)) return;
      event.preventDefault();
      const editor = this.editorContainer.getActiveFileTextEditor();
      if (!editor || this.isEncodingReadOnly(editor)) return;
      // At the workspace, not the file editor's element: a notebook's backing
      // editor lives outside the DOM, where a workspace-scoped command can
      // never be reached, and the handler resolves the editor itself anyway.
      lumine.commands.dispatch(this.element, "encoding-selector:show");
    };
    this.element.addEventListener("click", clickHandler);
    this.clickSubscription = new Disposable(() =>
      this.element.removeEventListener("click", clickHandler),
    );
    const view = this;
    this.menuSubscription = lumine.contextMenu.add({
      ".encoding-status": {
        commandTarget: "focus",
        items: [
          { type: "separator" },
          {
            label: "Select Encoding…",
            command: "encoding-selector:show",
            shouldDisplay: (event) => view.element.contains(event.target),
            created() {
              const editor = view.editorContainer.getActiveFileTextEditor();
              this.enabled = !!editor && !view.isEncodingReadOnly(editor);
            },
          },
          { type: "separator" },
        ],
      },
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.menuSubscription?.dispose();
    if (this.activeItemSubscription) {
      this.activeItemSubscription.dispose();
    }

    if (this.encodingSubscription) {
      this.encodingSubscription.dispose();
    }

    if (this.clickSubscription) {
      this.clickSubscription.dispose();
    }

    if (this.updateSubscription) {
      this.updateSubscription.dispose();
      this.updateSubscription = null;
    }

    if (this.tile) {
      this.tile.destroy();
    }

    if (this.tooltip) {
      this.tooltip.dispose();
    }
  }

  attach() {
    if (this.destroyed || this.tile) return;
    // File-identity band, see packages/status-bar/README.md.
    const tile = this.statusBar.addRightTile({ priority: 420, item: this.element });
    if (this.destroyed) tile.destroy();
    else this.tile = tile;
  }

  subscribeToActiveTextEditor() {
    if (this.destroyed) return;
    if (this.encodingSubscription) {
      this.encodingSubscription.dispose();
    }

    const editor = this.editorContainer.getActiveFileTextEditor();
    if (editor) {
      this.encodingSubscription = editor.onDidChangeEncoding(this.updateEncodingText.bind(this));
    }
    this.updateEncodingText();
  }

  updateEncodingText() {
    if (this.destroyed) return;
    if (this.updateSubscription) {
      this.updateSubscription.dispose();
    }

    this.updateSubscription = lumine.views.updateDocument(() => {
      this.updateSubscription = null;
      if (this.destroyed) return;
      const editor = this.editorContainer.getActiveFileTextEditor();
      if (editor && editor.getEncoding()) {
        const editorEncoding = editor
          .getEncoding()
          .toLowerCase()
          .replace(/[^0-9a-z]|:\d{4}$/g, "");
        const encodingLabel = this.encodings[editorEncoding] || { status: editorEncoding };
        this.element.textContent = encodingLabel.status;
        this.element.dataset.encoding = editorEncoding;
        this.element.style.display = "";
        const readOnly = this.isEncodingReadOnly(editor);
        this.element.classList.toggle("is-read-only", readOnly);
        this.element.setAttribute("aria-disabled", String(readOnly));

        if (this.tooltip) {
          const previous = this.tooltip;
          this.tooltip = null;
          previous.dispose();
        }
        if (this.destroyed) return;
        const tooltip = lumine.tooltips.add(this.element, {
          html: false,
          keyBindingCommand: readOnly ? null : "encoding-selector:show",
          keyBindingTarget: lumine.views.getView(editor),
          title: readOnly
            ? this.readOnlyEncodingMessage(editor)
            : `Uses ${encodingLabel.list ?? encodingLabel.status} encoding. Click to select an encoding.`,
        });
        if (this.destroyed) tooltip.dispose();
        else this.tooltip = tooltip;
      } else {
        this.element.style.display = "none";
        this.element.classList.remove("is-read-only");
        this.element.removeAttribute("aria-disabled");
      }
    });
  }
};
