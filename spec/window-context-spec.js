describe("encoding-selector presentation contexts", () => {
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    await lumine.packages.activatePackage("encoding-selector");
  });
  afterEach(async () => {
    await lumine.workspace.discardEditorWindows();
  });
  it("keeps simultaneous pickers beside their invoking editors", async () => {
    const workspace = lumine.workspace;
    const main = workspace.getMainWindow();
    const editor = await workspace.open();
    const extra = await workspace.openEditorWindow({ show: false });
    const copy = editor.copy();
    extra.getEditorContainer().getActivePane().activateItem(copy, { activatePane: true });
    await lumine.commands.dispatch(main.getElement(), "encoding-selector:show");
    await conditionPromise(() => main.getElement().querySelector(".encoding-selector"));
    await lumine.commands.dispatch(extra.getElement(), "encoding-selector:show");
    await conditionPromise(() => extra.getElement().querySelector(".encoding-selector"));
    expect(main.getElement().querySelector(".encoding-selector")).not.toBeNull();
    expect(extra.getElement().querySelector(".encoding-selector").ownerDocument).toBe(
      extra.getDocument(),
    );
  });
});
