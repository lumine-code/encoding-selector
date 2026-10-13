const fs = require("node:fs");
const path = require("node:path");

describe("encoding-selector native detector loading", () => {
  let editor, view;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    if (lumine.packages.isPackageLoaded("encoding-selector")) {
      await lumine.packages.unloadPackage("encoding-selector");
    }
    const pack = await lumine.packages.activatePackage("encoding-selector");
    const EncodingListView = require(path.join(pack.path, "lib/encoding-list-view.js"));
    view = new EncodingListView({ utf8: { list: "UTF-8" }, utf16le: { list: "UTF-16 LE" } });
    editor = await lumine.workspace.open(path.join(__dirname, "fixtures/sample.js"));
  });

  afterEach(async () => {
    await view.destroy();
    await lumine.packages.unloadPackage("encoding-selector");
    editor?.destroy();
  });

  async function heldDetector() {
    const detector = await view.loadDetector();
    let release;
    spyOn(view, "loadDetector").and.returnValue(
      new Promise((resolve) => (release = () => resolve(detector))),
    );
    return release;
  }

  it("opens its picker and chooses manual encodings without loading the detector", async () => {
    spyOn(view, "loadDetector").and.callThrough();
    await view.toggle(editor);
    await view.useEncoding({ id: "utf16le" });
    expect(editor.getEncoding()).toBe("utf16le");
    expect(view.loadDetector).not.toHaveBeenCalled();
  });

  it("restores unsaved Auto without loading the detector", async () => {
    const unsaved = await lumine.workspace.open();
    try {
      spyOn(view, "loadDetector").and.callThrough();
      unsaved.setEncoding("utf16le");
      await view.detectEncoding(unsaved);
      expect(unsaved.getEncoding()).toBe("utf8");
      expect(view.loadDetector).not.toHaveBeenCalled();
    } finally {
      unsaved.destroy();
    }
  });

  it("shares the native ESM detector between concurrent consumers", async () => {
    const [first, second] = await Promise.all([view.loadDetector(), view.loadDetector()]);
    expect(first).toBe(second);
    expect(first.detect(Buffer.from("plain ASCII")).encoding).toBe("ascii");
    expect(first.detect(Buffer.from("Zażółć gęślą jaźń. 你好世界. Καλημέρα κόσμε.")).encoding).toBe(
      "utf-8",
    );
    await view.detectEncoding(editor);
    expect(view.serialize()[0].encoding).toBe("utf8");
  });

  it("does not read disk or change encoding when aborted during import", async () => {
    const release = await heldDetector();
    spyOn(fs.promises, "readFile").and.callThrough();
    const controller = new AbortController();
    const pending = view.detectEncoding(editor, controller.signal);
    controller.abort();
    release();
    await pending;
    expect(fs.promises.readFile).not.toHaveBeenCalled();
    expect(view.serialize()).toEqual([]);
  });

  it("keeps a newer manual choice when an earlier import completes", async () => {
    const release = await heldDetector();
    spyOn(fs.promises, "readFile").and.callThrough();
    const pending = view.detectEncoding(editor);
    view.editor = editor;
    await view.useEncoding({ id: "utf16le" });
    release();
    await pending;
    expect(editor.getEncoding()).toBe("utf16le");
    expect(view.serialize()).toEqual([]);
    expect(fs.promises.readFile).not.toHaveBeenCalled();
  });

  it("drops an import after cancellation of its picker", async () => {
    await view.toggle(editor);
    const release = await heldDetector();
    spyOn(fs.promises, "readFile").and.callThrough();
    const pending = view.detectEncoding(editor);
    view.cancel();
    release();
    await pending;
    expect(fs.promises.readFile).not.toHaveBeenCalled();
    expect(view.serialize()).toEqual([]);
  });

  it("does not read an editor that was destroyed while the detector loaded", async () => {
    const release = await heldDetector();
    spyOn(fs.promises, "readFile").and.callThrough();
    const pending = view.detectEncoding(editor);
    editor.destroy();
    release();
    await pending;
    expect(fs.promises.readFile).not.toHaveBeenCalled();
  });

  it("does not reuse an old path after the detector import", async () => {
    const release = await heldDetector();
    spyOn(fs.promises, "readFile").and.callThrough();
    const pending = view.detectEncoding(editor);
    editor.getBuffer().setPath(path.join(__dirname, "fixtures/other.js"));
    release();
    await pending;
    expect(fs.promises.readFile).not.toHaveBeenCalled();
    expect(view.serialize()).toEqual([]);
  });

  it("does not read or publish detection from a destroyed package generation", async () => {
    const release = await heldDetector();
    spyOn(fs.promises, "readFile").and.callThrough();
    const retired = view;
    const pending = view.detectEncoding(editor);
    await view.destroy();
    await lumine.packages.unloadPackage("encoding-selector");
    const pack = await lumine.packages.activatePackage("encoding-selector");
    const EncodingListView = require(path.join(pack.path, "lib/encoding-list-view.js"));
    view = new EncodingListView({ utf8: { list: "UTF-8" } });
    release();
    await pending;
    expect(retired.destroyed).toBe(true);
    expect(view.serialize()).toEqual([]);
    expect(fs.promises.readFile).not.toHaveBeenCalled();
  });

  it("allows another detection after a failed import", async () => {
    spyOn(view, "loadDetector").and.rejectWith(new Error("Held detector import failed"));
    await expectAsync(view.detectEncoding(editor)).toBeRejectedWithError(
      "Held detector import failed",
    );
    expect(view.serialize()).toEqual([]);
    view.loadDetector.and.callThrough();
    await view.detectEncoding(editor);
    expect(view.serialize()[0].encoding).toBe("utf8");
  });
});
