describe("Encoding Selector command availability", () => {
  let editor;
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("encoding-selector");
  });
  afterEach(async () => {
    editor?.destroy();
    await lumine.packages.deactivatePackage("encoding-selector");
    editor = null;
  });
  it("declines missing files and format-locked encoding without opening UI", async () => {
    expect(
      lumine.commands.canDispatch(lumine.workspace.getElement(), "encoding-selector:show"),
    ).toBe(false);
    editor = await lumine.workspace.open();
    editor.isEncodingReadOnly = () => true;
    expect(lumine.commands.canDispatch(editor.element, "encoding-selector:show")).toBe(false);
  });
  it("keeps a locked captured editor unchanged when a picker was already open", async () => {
    editor = await lumine.workspace.open();
    await lumine.commands.dispatch(editor.element, "encoding-selector:show");
    const list = lumine.workspace
      .getModalPanels()
      .find((panel) => panel.isVisible())
      .getItem();
    await list.selectItemById("utf16le");
    editor.isEncodingReadOnly = () => true;
    expect((await list.confirmSelection()).status).toBe("disabled");
    expect(editor.getEncoding()).toBe("utf8");
  });
});
