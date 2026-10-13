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
    await lumine.workspace.discardEditorWindows();
    await lumine.packages.deactivatePackage("encoding-selector");
  });

  it("shows the owned encoding shortcut and suppresses it without a file editor", async () => {
    const element = tile();
    const menu = lumine.contextMenu.templateForElement(element);
    const label = process.platform === "darwin" ? "⌃⇧U" : "Ctrl+Shift+U";
    expect(menu[0].keyBindingLabel).toBe(label);
    const popup = lumine.contextMenu.show(element, menu);
    try {
      expect(popup.element.querySelector(".menu-item-keystroke").textContent).toBe(label);
    } finally {
      popup.close();
    }
    await lumine.workspace.open({
      getTitle: () => "Preview",
      element: document.createElement("div"),
    });
    expect(lumine.contextMenu.templateForElement(element)[0].keyBindingLabel).toBe("");
  });

  it("offers the primary mouse action and ignores right button clicks", () => {
    const element = tile();
    expect(element.hasAttribute("data-context-menu-boundary")).toBe(true);
    const commands = lumine.contextMenu.templateForElement(element).map((item) => item.command);
    expect(commands).toContain("encoding-selector:show");
    const [tooltip] = lumine.tooltips.findTooltips(element);
    expect(tooltip.getTitle()).toContain("Click to");
    expect(tooltip.getTitle()).not.toContain("tooltip-composite");
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

  it("looks up the backing file's shortcut in its own window, including detached editors", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    const file = lumine.workspace.buildTextEditor();
    const cell = lumine.workspace.buildTextEditor();
    file.getElement().setAttribute("data-menu-owner", "file");
    cell.getElement().setAttribute("data-menu-owner", "cell");
    const host = extra.getDocument().createElement("div");
    host.getFileTextEditor = () => file;
    host.getActiveEmbeddedTextEditor = () => cell;
    host.onDidChangeActiveTextEditors = () => ({ dispose() {} });
    host.append(cell.getElement());
    extra.getEditorContainer().getActivePane().activateItem(host, { activatePane: true });
    const keys = lumine.keymaps.add(
      "encoding-status-file-owner-spec",
      {
        'lumine-text-editor[data-menu-owner="file"]': { "ctrl-alt-1": "encoding-selector:show" },
        'lumine-text-editor[data-menu-owner="cell"]': { "ctrl-alt-2": "encoding-selector:show" },
      },
      100,
    );
    try {
      const remote = extra.getElement().querySelector(".encoding-status");
      expect(lumine.contextMenu.templateForElement(remote)[0].keyBindingLabel).toBe(
        process.platform === "darwin" ? "⌃⌥1" : "Ctrl+Alt+1",
      );
      expect(lumine.contextMenu.templateForElement(tile())[0].keyBindingLabel).toBe(
        process.platform === "darwin" ? "⌃⇧U" : "Ctrl+Shift+U",
      );
    } finally {
      keys.dispose();
      await extra.getEditorContainer().getActivePane().destroyItem(host, true);
      cell.destroy();
      file.destroy();
    }
  });
});
