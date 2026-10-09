describe("Encoding selector status lifetime", () => {
  let main, editor, hub, consumer, bars, providers, StatusBarView;
  const tiles = (bar) =>
    bar.getRightTiles().filter((tile) => tile.getItem().matches?.(".encoding-status"));
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    StatusBarView = lumine.packages.getActivePackage("status-bar").mainModule.statusBar.constructor;
    main = (await lumine.packages.activatePackage("encoding-selector")).mainModule;
    editor = await lumine.workspace.open();
    hub = new lumine.packages.serviceHub.constructor();
    consumer = hub.consume("status-bar", "^1.0.0", (bar) => main.consumeStatusBar(bar));
    bars = [];
    providers = [];
  });
  afterEach(async () => {
    consumer.dispose();
    providers.forEach((provider) => provider.dispose());
    await lumine.packages.deactivatePackage("encoding-selector");
    bars.forEach((bar) => bar.destroy());
  });
  function provide(bar) {
    if (!bar) {
      bar = new StatusBarView();
      bars.push(bar);
      jasmine.attachToDOM(bar.element);
    }
    const provider = hub.provide("status-bar", "1.0.0", bar);
    providers.push(provider);
    return { bar, provider };
  }

  it("shares an exact payload until its final lease is withdrawn", () => {
    const first = provide(),
      second = provide(first.bar);
    expect(tiles(first.bar).length).toBe(1);
    first.provider.dispose();
    expect(tiles(first.bar).length).toBe(1);
    second.provider.dispose();
    expect(tiles(first.bar).length).toBe(0);
  });

  it("retires every status view and tooltip on package deactivation", async () => {
    const first = provide(),
      second = provide();
    await lumine.views.getNextUpdatePromise();
    const elements = [first.bar, second.bar].map((bar) => tiles(bar)[0].getItem());

    await lumine.packages.deactivatePackage("encoding-selector");

    for (const bar of [first.bar, second.bar]) expect(tiles(bar).length).toBe(0);
    for (const element of elements) {
      expect(element.isConnected).toBe(false);
      expect(lumine.tooltips.findTooltips(element)).toEqual([]);
    }
  });

  it("names Windows 1258 consistently in the actual status tile and picker", async () => {
    const { bar } = provide();
    editor.setEncoding("windows1258");
    await lumine.views.getNextUpdatePromise();
    expect(tiles(bar)[0].getItem().textContent).toBe("Windows 1258");
    await lumine.commands.dispatch(editor.element, "encoding-selector:show");
    const panel = lumine.workspace.getModalPanels().find((item) => item.isVisible());
    const row = panel
      .getItem()
      .getItems()
      .find((item) => item.id === "windows1258");
    expect(row.name).toBe("Vietnamese (Windows 1258)");
  });

  it("retires a tile returned after package deactivation during allocation", () => {
    const bar = new StatusBarView();
    bars.push(bar);
    jasmine.attachToDOM(bar.element);
    const add = bar.addRightTile.bind(bar);
    spyOn(bar, "addRightTile").and.callFake((options) => {
      const tile = add(options);
      main.deactivate();
      return tile;
    });
    provide(bar);
    expect(tiles(bar).length).toBe(0);
  });

  it("keeps a later same-payload activation alive when its old lease ends", async () => {
    const first = provide();
    await lumine.packages.deactivatePackage("encoding-selector");
    main = (await lumine.packages.activatePackage("encoding-selector")).mainModule;
    const current = provide(first.bar);
    first.provider.dispose();
    expect(tiles(current.bar).length).toBe(1);
  });

  it("does not destroy a replacement picker created from an old tile disposer", async () => {
    const first = provide();
    const tile = tiles(first.bar)[0];
    const destroy = tile.destroy.bind(tile);
    let opening;
    spyOn(tile, "destroy").and.callFake(() => {
      main.activate();
      opening = lumine.commands.dispatch(editor.element, "encoding-selector:show");
      provide(first.bar);
      destroy();
    });

    main.deactivate();
    await opening;

    expect(lumine.workspace.getModalPanels().some((panel) => panel.isVisible())).toBe(true);
    expect(tiles(first.bar).length).toBe(1);
  });
});
