const { Disposable } = require("lumine");

module.exports = class EncodingStatusView {
  constructor(statusBar, encodings, { isEncodingReadOnly, readOnlyEncodingMessage }) {
    this.statusBar = statusBar;
    this.encodings = encodings;
    this.isEncodingReadOnly = isEncodingReadOnly;
    this.readOnlyEncodingMessage = readOnlyEncodingMessage;
    this.element = document.createElement("status-bar-tile");
    this.element.classList.add("encoding-status");

    this.activeItemSubscription = lumine.workspace.observeActiveFileTextEditor(
      this.subscribeToActiveTextEditor.bind(this),
    );
    const clickHandler = (event) => {
      event.preventDefault();
      const editor = lumine.workspace.getActiveFileTextEditor();
      if (!editor || this.isEncodingReadOnly(editor)) return;
      // At the workspace, not the file editor's element: a notebook's backing
      // editor lives outside the DOM, where a workspace-scoped command can
      // never be reached, and the handler resolves the editor itself anyway.
      lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "encoding-selector:show");
    };
    this.element.addEventListener("click", clickHandler);
    this.clickSubscription = new Disposable(() =>
      this.element.removeEventListener("click", clickHandler),
    );
  }

  destroy() {
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
    // File-identity band, see packages/status-bar/README.md.
    this.tile = this.statusBar.addRightTile({ priority: 420, item: this.element });
  }

  subscribeToActiveTextEditor() {
    if (this.encodingSubscription) {
      this.encodingSubscription.dispose();
    }

    const editor = lumine.workspace.getActiveFileTextEditor();
    if (editor) {
      this.encodingSubscription = editor.onDidChangeEncoding(this.updateEncodingText.bind(this));
    }
    this.updateEncodingText();
  }

  updateEncodingText() {
    if (this.updateSubscription) {
      this.updateSubscription.dispose();
    }

    this.updateSubscription = lumine.views.updateDocument(() => {
      this.updateSubscription = null;
      const editor = lumine.workspace?.getActiveFileTextEditor();
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
          this.tooltip.dispose();
        }
        this.tooltip = lumine.tooltips.add(this.element, {
          title: readOnly
            ? this.readOnlyEncodingMessage(editor)
            : `This file uses ${encodingLabel.list} encoding`,
        });
      } else {
        this.element.style.display = "none";
        this.element.classList.remove("is-read-only");
        this.element.removeAttribute("aria-disabled");
      }
    });
  }
};
