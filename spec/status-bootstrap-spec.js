const path = require("node:path");
const windowService = require("./helpers/window-service");

describe("encoding status bootstrap", () => {
  let main, bar, leases;
  const tiles = () =>
    bar.getRightTiles().filter((tile) => tile.getItem().matches?.(".encoding-status"));

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    if (lumine.packages.isPackageLoaded("encoding-selector"))
      await lumine.packages.unloadPackage("encoding-selector");
    await lumine.workspace.open({
      getTitle: () => "Preview",
      element: document.createElement("div"),
    });
    main = (await lumine.packages.activatePackage("encoding-selector")).mainModule;
    const StatusBar =
      lumine.packages.getActivePackage("status-bar").mainModule.statusBar.constructor;
    bar = new StatusBar();
    leases = [main.consumeStatusBar(windowService(bar))];
  });

  afterEach(async () => {
    for (const lease of leases) lease.dispose();
    await lumine.packages.unloadPackage("encoding-selector");
    bar.destroy();
  });

  it("keeps absent file UI cold and mounts the first file tile immediately", async () => {
    const filename = path.join(__dirname, "../lib/encoding-status-view.js");
    expect(Object.values(require.cache).some((entry) => entry?.filename === filename)).toBe(false);
    expect(tiles()).toEqual([]);
    await lumine.workspace.open();
    expect(tiles().length).toBe(1);
    expect(Object.values(require.cache).some((entry) => entry?.filename === filename)).toBe(true);
    await lumine.views.getNextUpdatePromise();
    expect(tiles()[0].getItem().textContent).toBe("UTF-8");
  });

  it("shares pending ownership and ignores an editor after the final withdrawal", async () => {
    leases.push(main.consumeStatusBar(windowService(bar)));
    leases[0].dispose();
    await lumine.workspace.open();
    expect(tiles().length).toBe(1);
    leases[1].dispose();
    expect(tiles().length).toBe(0);
    await lumine.workspace.open();
    expect(tiles().length).toBe(0);
  });
});
