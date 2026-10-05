const { CompositeDisposable } = require("lumine");

// Selection provenance belongs to the buffer lifecycle, independently of
// whether the picker has ever been opened in this window.
module.exports = class EncodingSelection {
  constructor(encodings, records = []) {
    this.encodings = encodings;
    this.destroyed = false;
    this.revision = 0;
    this.generations = new WeakMap();
    this.bufferSubscriptions = new Map();
    this.recordBuffers = new Map();
    this.disposables = new CompositeDisposable(
      lumine.project.onDidAddBuffer((buffer) => this.observeBuffer(buffer)),
      // Deserialization replaces the buffer set without emitting did-add-buffer,
      // then publishes its project paths. Observe those restored instances too.
      lumine.project.onDidChangePaths(() => this.observeProjectBuffers()),
    );
    this.restoreState(records);
  }

  restoreState(records = []) {
    this.revision++;
    this.automaticEncodings = new Map(
      (Array.isArray(records) ? records : [])
        .filter((entry) => typeof entry?.bufferId === "string" && this.encodings[entry.encoding])
        .map(({ bufferId, encoding }) => [bufferId, encoding]),
    );
    this.recordBuffers.clear();
    this.observeProjectBuffers();
  }

  observeProjectBuffers() {
    if (this.destroyed) return;
    const buffers = new Set(lumine.project.getBuffers());
    for (const [buffer, subscription] of this.bufferSubscriptions) {
      if (buffers.has(buffer)) continue;
      subscription.dispose();
      this.bufferSubscriptions.delete(buffer);
      if (this.recordBuffers.get(buffer.getId()) === buffer) {
        this.recordBuffers.delete(buffer.getId());
      }
    }
    for (const buffer of buffers) this.observeBuffer(buffer);
  }

  observeBuffer(buffer) {
    if (this.destroyed || buffer.isDestroyed()) return;
    const bufferId = buffer.getId();
    if (this.automaticEncodings.has(bufferId)) this.recordBuffers.set(bufferId, buffer);
    if (this.bufferSubscriptions.has(buffer)) return;
    const clear = () => this.clearAutomatic(buffer);
    const subscription = new CompositeDisposable(
      buffer.onDidChangeEncoding(clear),
      buffer.onDidChangePath(clear),
      buffer.onDidDestroy(() => {
        clear();
        this.bufferSubscriptions.delete(buffer);
        this.generations.delete(buffer);
        subscription.dispose();
      }),
    );
    this.bufferSubscriptions.set(buffer, subscription);
  }

  clearAutomatic(buffer) {
    const bufferId = buffer.getId();
    if (this.recordBuffers.get(bufferId) === buffer) {
      this.automaticEncodings.delete(bufferId);
      this.recordBuffers.delete(bufferId);
    }
    this.generations.set(buffer, (this.generations.get(buffer) || 0) + 1);
  }

  chooseManual(buffer) {
    this.observeBuffer(buffer);
    this.clearAutomatic(buffer);
  }

  isAutomatic(buffer) {
    this.observeBuffer(buffer);
    return this.automaticEncodings.get(buffer.getId()) === buffer.getEncoding();
  }

  beginDetection(buffer) {
    this.observeBuffer(buffer);
    const generation = (this.generations.get(buffer) || 0) + 1;
    this.generations.set(buffer, generation);
    return { revision: this.revision, generation };
  }

  isCurrent(buffer, token) {
    return (
      !this.destroyed &&
      !buffer.isDestroyed() &&
      token.revision === this.revision &&
      token.generation === this.generations.get(buffer)
    );
  }

  rememberAutomatic(buffer, encoding) {
    if (this.destroyed || buffer.isDestroyed() || buffer.getEncoding() !== encoding) return;
    this.observeBuffer(buffer);
    this.automaticEncodings.set(buffer.getId(), encoding);
    this.recordBuffers.set(buffer.getId(), buffer);
  }

  serialize() {
    this.observeProjectBuffers();
    const buffers = new Map(lumine.project.getBuffers().map((buffer) => [buffer.getId(), buffer]));
    return Array.from(this.automaticEncodings, ([bufferId, encoding]) => ({
      bufferId,
      encoding,
    })).filter(({ bufferId, encoding }) => {
      const buffer = buffers.get(bufferId);
      return buffer != null && !buffer.isDestroyed() && buffer.getEncoding() === encoding;
    });
  }

  destroy() {
    this.destroyed = true;
    this.revision++;
    this.disposables.dispose();
    for (const subscription of this.bufferSubscriptions.values()) subscription.dispose();
    this.bufferSubscriptions.clear();
    this.recordBuffers.clear();
  }
};
