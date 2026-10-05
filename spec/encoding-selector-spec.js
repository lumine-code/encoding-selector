const path = require("path");

describe("EncodingSelector", () => {
  let editor;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));

    await lumine.packages.activatePackage("status-bar");
    await lumine.packages.activatePackage("encoding-selector");
    editor = await lumine.workspace.open(path.join(__dirname, "fixtures", "sample.js"));
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("encoding-selector");
  });

  describe("when encoding-selector:show is triggered", () => {
    it("displays a list of all the available encodings", async () => {
      lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
      await lumine.views.getNextUpdatePromise();

      expect(document.body.querySelectorAll(".encoding-selector li").length).toBeGreaterThan(1);
    });

    it("puts the file's encoding under Auto Detect and rules the rest off", async () => {
      editor.setEncoding("utf16le");
      lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
      await lumine.views.getNextUpdatePromise();

      const view = lumine.workspace.getModalPanels()[0].getItem();
      await conditionPromise(() => view.getElement().querySelector(".select-list-separator"));
      const displayedItems = view.getDisplayedItems();
      expect(displayedItems[0].id).toBe("detect");
      expect(displayedItems[1].id).toBe("utf16le");

      const separator = view.getElement().querySelector(".select-list-separator");
      expect(separator.previousElementSibling.dataset.encoding).toBe("utf16le");
      expect(separator.nextElementSibling.dataset.encoding).toBe(displayedItems[2].id);
    });

    it("drops the rule once a query ranks the rows instead", async () => {
      editor.setEncoding("utf16le");
      lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
      await lumine.views.getNextUpdatePromise();

      const view = lumine.workspace.getModalPanels()[0].getItem();
      view.getQueryEditor().setText("utf");
      await lumine.views.getNextUpdatePromise();

      expect(view.getElement().querySelector(".select-list-separator")).toBeNull();
    });

    it("reports a format-owned encoding instead of opening the picker", async () => {
      editor.isEncodingReadOnly = () => true;
      spyOn(lumine.notifications, "addInfo");

      lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
      await lumine.views.getNextUpdatePromise();

      expect(lumine.notifications.addInfo).toHaveBeenCalledWith(
        "This file format requires UTF-8 encoding.",
      );
      expect(lumine.workspace.getModalPanels().length).toBe(0);
    });
  });

  describe("when an encoding is selected", () => {
    it("sets the new encoding on the editor", async () => {
      lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
      await lumine.views.getNextUpdatePromise();

      const encodingListView = lumine.workspace.getModalPanels()[0].getItem();
      await encodingListView.selectItemById("utf16le");
      await encodingListView.confirmSelection();
      expect(editor.getEncoding()).toBe("utf16le");
    });

    it("applies the selection to the file that opened the picker", async () => {
      lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
      await lumine.views.getNextUpdatePromise();
      const encodingListView = lumine.workspace.getModalPanels()[0].getItem();

      const otherEditor = await lumine.workspace.open("");
      await encodingListView.selectItemById("utf16le");
      await encodingListView.confirmSelection();

      expect(editor.getEncoding()).toBe("utf16le");
      expect(otherEditor.getEncoding()).toBe("utf8");
    });
  });

  describe("when Auto Detect is selected", () => {
    it("detects the character set and applies that encoding", async () => {
      const encodingChangeHandler = jasmine.createSpy("encodingChangeHandler");
      editor.onDidChangeEncoding(encodingChangeHandler);

      editor.setEncoding("utf16le");
      expect(encodingChangeHandler.calls.count()).toBe(1);

      lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
      await lumine.views.getNextUpdatePromise();

      const encodingListView = lumine.workspace.getModalPanels()[0].getItem();
      await encodingListView.selectItemById("detect");
      await encodingListView.confirmSelection();
      expect(editor.getEncoding()).toBe("utf8");
      expect(encodingChangeHandler.calls.count()).toBe(2);
    });

    async function openPicker() {
      lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
      await lumine.views.getNextUpdatePromise();
      await conditionPromise(() =>
        lumine.workspace.getModalPanels().some((panel) => panel.isVisible()),
      );
      return lumine.workspace
        .getModalPanels()
        .find((panel) => panel.isVisible())
        .getItem();
    }

    async function chooseAuto() {
      const view = await openPicker();
      await view.selectItemById("detect");
      await view.confirmSelection();
    }

    it("keeps the tick on Auto and marks its result separately above the separator", async () => {
      await chooseAuto();
      const view = await openPicker();
      const element = view.getElement();

      expect(
        Array.from(element.querySelectorAll("li.active"), (row) => row.dataset.encoding),
      ).toEqual(["detect"]);
      expect(element.querySelector("li.auto-selected").dataset.encoding).toBe("utf8");
      expect(element.querySelectorAll("li.selected").length).toBe(1);
      expect(view.getSelectedItem().id).toBe("detect");
      expect(
        view
          .getDisplayedItems()
          .slice(0, 2)
          .map((item) => item.id),
      ).toEqual(["detect", "utf8"]);
      expect(
        element.querySelector(".select-list-separator").previousElementSibling.dataset.encoding,
      ).toBe("utf8");
    });

    it("clears Auto when the same concrete encoding is chosen manually", async () => {
      await chooseAuto();
      let view = await openPicker();
      await view.selectItemById("utf8");
      await view.confirmSelection();
      view = await openPicker();

      expect(view.getElement().querySelector("li.active").dataset.encoding).toBe("utf8");
      expect(view.getElement().querySelectorAll("li.active").length).toBe(1);
      expect(view.getElement().querySelector("li.auto-selected")).toBeNull();
      expect(view.getSelectedItem().id).toBe("utf8");
    });

    it("keeps Auto choices separate for each buffer", async () => {
      await chooseAuto();
      const firstEditor = editor;
      editor = await lumine.workspace.open(path.join(__dirname, "fixtures", "other.js"));
      let view = await openPicker();
      expect(view.getElement().querySelector("li.active").dataset.encoding).toBe("utf8");
      expect(view.getElement().querySelector("li.auto-selected")).toBeNull();
      lumine.workspace
        .getModalPanels()
        .find((panel) => panel.isVisible())
        .hide();
      editor = firstEditor;
      await lumine.workspace.open(firstEditor);
      view = await openPicker();
      expect(view.getElement().querySelector("li.active").dataset.encoding).toBe("detect");
    });

    it("restores the automatic choice from serialized package state", async () => {
      await chooseAuto();
      const state = lumine.packages.getActivePackage("encoding-selector").mainModule.serialize();
      const EncodingListView = require("../lib/encoding-list-view");
      const restored = new EncodingListView({ utf8: { list: "UTF-8" } }, state.automaticEncodings);
      try {
        await restored.toggle(editor);
        expect(restored.selectList.getElement().querySelector("li.active").dataset.encoding).toBe(
          "detect",
        );
        expect(
          restored.selectList.getElement().querySelector("li.auto-selected").dataset.encoding,
        ).toBe("utf8");
      } finally {
        await restored.destroy();
      }
    });

    it("keeps a short list in natural order without a pinned separator", async () => {
      const EncodingListView = require("../lib/encoding-list-view");
      const list = new EncodingListView({
        utf16le: { list: "UTF-16 LE" },
        utf8: { list: "UTF-8" },
      });
      try {
        await list.detectEncoding(editor);
        await list.toggle(editor);
        await lumine.views.getNextUpdatePromise();
        expect(list.selectList.getDisplayedItems().map((item) => item.id)).toEqual([
          "detect",
          "utf16le",
          "utf8",
        ]);
        expect(list.selectList.getElement().querySelector(".select-list-separator")).toBeNull();
        expect(
          list.selectList.getElement().querySelector("li.auto-selected").dataset.encoding,
        ).toBe("utf8");
      } finally {
        await list.destroy();
      }
    });

    it("restores Auto selection when reopening after a search", async () => {
      await chooseAuto();
      let view = await openPicker();
      view.getQueryEditor().setText("utf16");
      await lumine.views.getNextUpdatePromise();
      lumine.workspace
        .getModalPanels()
        .find((panel) => panel.isVisible())
        .hide();
      view = await openPicker();
      expect(view.getQuery()).toBe("");
      expect(view.getSelectedItem().id).toBe("detect");
    });

    it("returns to a concrete choice after an external encoding change", async () => {
      await chooseAuto();
      editor.setEncoding("utf16le");
      const view = await openPicker();
      expect(view.getElement().querySelector("li.active").dataset.encoding).toBe("utf16le");
      expect(view.getElement().querySelector("li.auto-selected")).toBeNull();
    });

    it("replaces the Auto choice when an active package restores project state", async () => {
      await chooseAuto();
      const main = lumine.packages.getActivePackage("encoding-selector").mainModule;
      const saved = main.serialize();
      main.restoreState({});
      let view = await openPicker();
      expect(view.getElement().querySelector("li.active").dataset.encoding).toBe("utf8");
      lumine.workspace
        .getModalPanels()
        .find((panel) => panel.isVisible())
        .hide();
      main.restoreState(saved);
      view = await openPicker();
      expect(view.getElement().querySelector("li.active").dataset.encoding).toBe("detect");
      expect(view.getElement().querySelector("li.auto-selected").dataset.encoding).toBe("utf8");
    });

    it("observes restored Auto choices before the picker has been created", async () => {
      await chooseAuto();
      const saved = lumine.packages.getActivePackage("encoding-selector").mainModule.serialize();
      await lumine.packages.deactivatePackage("encoding-selector");
      await lumine.packages.activatePackage("encoding-selector");
      const main = lumine.packages.getActivePackage("encoding-selector").mainModule;
      main.restoreState(saved);
      editor.setEncoding("utf16le");
      editor.setEncoding("utf8");
      const view = await openPicker();
      expect(view.getElement().querySelector("li.active").dataset.encoding).toBe("utf8");
      expect(view.getElement().querySelector("li.auto-selected")).toBeNull();
      expect(main.serialize().automaticEncodings).toEqual([]);
    });

    it("allows a manual fallback after detecting the file fails", async () => {
      const fs = require("fs");
      const read = spyOn(fs.promises, "readFile").and.rejectWith(
        new Error("Cannot read the file."),
      );
      const view = await openPicker();
      await view.selectItemById("detect");
      await expectAsync(view.confirmSelection()).toBeRejectedWithError("Cannot read the file.");
      expect(lumine.workspace.getModalPanels().some((panel) => panel.isVisible())).toBe(true);
      read.and.callThrough();
      await view.selectItemById("utf16le");
      await view.confirmSelection();
      expect(editor.getEncoding()).toBe("utf16le");
      expect(
        lumine.packages.getActivePackage("encoding-selector").mainModule.serialize()
          .automaticEncodings,
      ).toEqual([]);
    });

    it("ignores a pending detection after a newer manual choice", async () => {
      const fs = require("fs");
      const EncodingListView = require("../lib/encoding-list-view");
      const list = new EncodingListView({
        utf8: { list: "UTF-8" },
        utf16le: { list: "UTF-16 LE" },
      });
      let finishRead;
      spyOn(fs.promises, "readFile").and.returnValue(
        new Promise((resolve) => {
          finishRead = resolve;
        }),
      );
      try {
        const detection = list.detectEncoding(editor);
        list.editor = editor;
        list.useEncoding({ id: "utf16le" });
        finishRead(Buffer.from("plain ASCII"));
        await detection;
        expect(editor.getEncoding()).toBe("utf16le");
        expect(list.serialize()).toEqual([]);
      } finally {
        await list.destroy();
      }
    });

    it("does not remember Auto after an unsupported detection", async () => {
      const EncodingListView = require("../lib/encoding-list-view");
      const list = new EncodingListView({ utf16le: { list: "UTF-16 LE" } });
      try {
        await expectAsync(list.detectEncoding(editor)).toBeRejectedWithError(
          "The file's encoding could not be detected.",
        );
        expect(editor.getEncoding()).toBe("utf8");
        expect(list.serialize()).toEqual([]);
      } finally {
        await list.destroy();
      }
    });
  });

  describe("encoding label", () => {
    let encodingStatus;

    beforeEach(async () => {
      encodingStatus = document.querySelector(".encoding-status");

      // Wait for status bar service hook to fire
      while (!encodingStatus || !encodingStatus.textContent) {
        await lumine.views.getNextUpdatePromise();
        encodingStatus = document.querySelector(".encoding-status");
      }
    });

    it("displays the name of the current encoding", () => {
      expect(encodingStatus.textContent).toBe("UTF-8");
    });

    it("keeps a format-owned encoding visible but does not make it clickable", async () => {
      editor.isEncodingReadOnly = () => true;
      editor.setEncoding("utf16le");
      editor.setEncoding("utf8");
      await lumine.views.getNextUpdatePromise();

      const eventHandler = jasmine.createSpy("eventHandler");
      lumine.commands.add("lumine-workspace", "encoding-selector:show", eventHandler);
      encodingStatus.click();

      expect(encodingStatus.textContent).toBe("UTF-8");
      expect(encodingStatus.getAttribute("aria-disabled")).toBe("true");
      expect(encodingStatus.classList.contains("is-read-only")).toBe(true);
      expect(eventHandler).not.toHaveBeenCalled();
      expect(getTooltipText(encodingStatus)).toBe("This file format requires UTF-8 encoding.");
    });

    it("hides the label when the current encoding is null", async () => {
      spyOn(editor, "getEncoding").and.returnValue(null);
      editor.setEncoding("utf16le");
      await lumine.views.getNextUpdatePromise();
      expect(encodingStatus.offsetHeight).toBe(0);
    });

    describe("when the editor's encoding changes", () => {
      it("displays the new encoding of the editor", async () => {
        expect(encodingStatus.textContent).toBe("UTF-8");
        editor.setEncoding("utf16le");
        await lumine.views.getNextUpdatePromise();
        expect(encodingStatus.textContent).toBe("UTF-16 LE");
      });
    });

    describe("when clicked", () => {
      it("toggles the encoding-selector:show event", () => {
        // The tile dispatches at the workspace: a notebook's file editor has
        // no element in the DOM, and the handler resolves the editor itself.
        const eventHandler = jasmine.createSpy("eventHandler");
        lumine.commands.add("lumine-workspace", "encoding-selector:show", eventHandler);
        encodingStatus.click();
        expect(eventHandler).toHaveBeenCalled();
      });
    });

    describe("when the package is deactivated", () => {
      it("removes the view", async () => {
        await lumine.packages.deactivatePackage("encoding-selector");
        expect(encodingStatus.parentElement).toBeNull();
      });

      it("cancels a pending label update", async () => {
        const updateSubscription = jasmine.createSpyObj("update subscription", ["dispose"]);
        spyOn(lumine.views, "updateDocument").and.returnValue(updateSubscription);

        editor.setEncoding("utf16le");
        await lumine.packages.deactivatePackage("encoding-selector");

        expect(updateSubscription.dispose).toHaveBeenCalled();
      });
    });
  });
});

function getTooltipText(element) {
  const [tooltip] = lumine.tooltips.findTooltips(element);
  return tooltip.getTitle();
}
