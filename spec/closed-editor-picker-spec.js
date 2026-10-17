describe("Encoding Selector visible picker ownership", () => {
  let editor, panel, model;
  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    spyOn(lumine.clipboard, "write");
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("encoding-selector");
    editor = await lumine.workspace.open();
    editor.setText("Owned text");
    await lumine.commands.dispatch(editor.getElement(), "encoding-selector:show");
    await conditionPromise(() => lumine.workspace.getModalPanels().some((p) => p.isVisible()));
    panel = lumine.workspace.getModalPanels().find((p) => p.isVisible());
    model = panel.getItem();
    await lumine.views.getNextUpdatePromise();
  });
  afterEach(async () => {
    if (lumine.packages.isPackageLoaded("encoding-selector"))
      await lumine.packages.unloadPackage("encoding-selector");
    editor?.destroy();
    await lumine.fileWatchClient.settlePendingTeardown();
  });
  it("dismisses its mounted picker when the captured editor is destroyed", () => {
    editor.destroy();
    expect(editor.isDestroyed()).toBe(true);
    expect(panel.isVisible()).toBe(false);
  });
  it("still changes the living captured editor after another tab becomes active", async () => {
    const other = await lumine.workspace.open();
    try {
      await model.selectItemById("utf16le");
      expect(model.getSelectedItem().id).toBe("utf16le");
      await model.confirmSelection();
      expect(editor.getEncoding()).toBe("utf16le");
      expect(other.getEncoding()).toBe("utf8");
      expect(panel.isVisible()).toBe(false);
    } finally {
      other.destroy();
    }
  });

  it("keeps applying encoding choices to its captured editor while open", async () => {
    await model.runAction("select-list:toggle-keep-open");
    const other = await lumine.workspace.open();
    try {
      for (const encoding of ["utf16le", "utf8"]) {
        await model.selectItemById(encoding);
        await model.confirmSelection();
        expect(editor.getEncoding()).toBe(encoding);
        expect(other.getEncoding()).toBe("utf8");
        expect(panel.isVisible()).toBe(true);
        expect(model.getElement().querySelector("li.active").dataset.encoding).toBe(encoding);
      }
      editor.destroy();
      expect(panel.isVisible()).toBe(false);
    } finally {
      other.destroy();
    }
  });
});
