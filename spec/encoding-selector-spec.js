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
      await new Promise((resolve) => {
        encodingChangeHandler.and.callFake(() => {
          expect(editor.getEncoding()).toBe("utf8");
          resolve();
        });
      });
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
