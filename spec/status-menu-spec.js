describe("encoding-selector status action menu", () => {
  let editor;
  const tile = () => lumine.workspace.getElement().querySelector(".encoding-status");
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    await lumine.packages.activatePackage("encoding-selector");
    editor = await lumine.workspace.open();
    editor.setText("first\nsecond\n");
    await conditionPromise(() => tile() && tile().style.display !== "none");
    await lumine.views.getNextUpdatePromise();
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("encoding-selector");
  });

  it("offers the primary mouse action and ignores right button clicks", () => {
    const element = tile();
    expect(element.hasAttribute("data-context-menu-boundary")).toBe(true);
    const commands = lumine.contextMenu.templateForElement(element).map((item) => item.command);
    expect(commands).toContain("encoding-selector:show");
    const dispatch = spyOn(lumine.commands, "dispatch");
    element.dispatchEvent(new MouseEvent("click", { button: 2, bubbles: true }));
    lumine.contextMenu.templateForElement(element);
    expect(dispatch).not.toHaveBeenCalled();
    element.click();
    expect(dispatch).toHaveBeenCalledOnceWith(element, "encoding-selector:show");
  });

  it("retires the tile click handler and its menu on deactivation", async () => {
    const element = tile();
    await lumine.packages.deactivatePackage("encoding-selector");
    const dispatch = spyOn(lumine.commands, "dispatch");
    element.click();
    expect(dispatch).not.toHaveBeenCalled();
    expect(
      lumine.contextMenu.templateForElement(element).map((item) => item.command),
    ).not.toContain("encoding-selector:show");
  });

  it("disables the picker while the format owns encoding", () => {
    editor.isEncodingReadOnly = () => true;
    expect(lumine.contextMenu.templateForElement(tile())[0].enabled).toBe(false);
    editor.isEncodingReadOnly = () => false;
    expect(lumine.contextMenu.templateForElement(tile())[0].enabled).toBe(true);
  });
});
