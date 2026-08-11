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
  });

  describe("when an encoding is selected", () => {
    it("sets the new encoding on the editor", async () => {
      lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
      await lumine.views.getNextUpdatePromise();

      const encodingListView = lumine.workspace.getModalPanels()[0].getItem();
      encodingListView.props.didConfirmSelection({ id: "utf16le" });
      expect(editor.getEncoding()).toBe("utf16le");
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
      encodingListView.props.didConfirmSelection({ id: "detect" });
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
        const eventHandler = jasmine.createSpy("eventHandler");
        lumine.commands.add("lumine-text-editor", "encoding-selector:show", eventHandler);
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
