const { CompositeDisposable } = require("lumine");

// Selection provenance belongs to the buffer lifecycle, independently of
// whether the picker has ever been opened in this window.
module.exports = class EncodingSelection {
  constructor(encodings, records = [], manualRecords = []) {
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
    this.restoreState(records, manualRecords);
  }

  restoreState(records = [], manualRecords = []) {
    this.revision++;
    this.automaticEncodings = this.recordsMap(records);
    this.manualEncodings = this.recordsMap(manualRecords);
    for (const bufferId of this.manualEncodings.keys()) this.automaticEncodings.delete(bufferId);
    this.recordBuffers.clear();
    this.observeProjectBuffers();
  }

  recordsMap(records) {
    return new Map(
      (Array.isArray(records) ? records : [])
        .filter((entry) => typeof entry?.bufferId === "string" && this.encodings[entry.encoding])
        .map(({ bufferId, encoding }) => [bufferId, encoding]),
    );
  }

  getDefaultEncoding(buffer) {
    const scope = buffer?.getLanguageMode?.()?.rootScopeDescriptor;
    const encoding = normalizeEncoding(
      lumine.config.get("editor.fileEncoding", scope ? { scope } : {}),
    );
    return this.encodings[encoding] ? encoding : "utf8";
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
    if (this.automaticEncodings.has(bufferId) || this.manualEncodings.has(bufferId)) {
      this.recordBuffers.set(bufferId, buffer);
    }
    if (this.bufferSubscriptions.has(buffer)) return;
    const subscription = new CompositeDisposable(
      buffer.onDidChangeEncoding(() => this.didChangeEncoding(buffer)),
      buffer.onDidChangePath(() => this.didChangePath(buffer)),
      buffer.onDidDestroy(() => {
        const ownsRecord = this.recordBuffers.get(bufferId) === buffer;
        this.clearAutomatic(buffer);
        if (ownsRecord) {
          this.manualEncodings.delete(bufferId);
          this.recordBuffers.delete(bufferId);
        }
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
      if (!this.manualEncodings.has(bufferId)) this.recordBuffers.delete(bufferId);
    }
    this.generations.set(buffer, (this.generations.get(buffer) || 0) + 1);
  }

  chooseManual(buffer) {
    this.observeBuffer(buffer);
    this.clearAutomatic(buffer);
    this.manualEncodings.set(buffer.getId(), normalizeEncoding(buffer.getEncoding()));
    this.recordBuffers.set(buffer.getId(), buffer);
  }

  didChangeEncoding(buffer) {
    const bufferId = buffer.getId();
    const ownsRecord = this.recordBuffers.get(bufferId) === buffer;
    const explicit =
      ownsRecord && (this.automaticEncodings.has(bufferId) || this.manualEncodings.has(bufferId));
    // Factory initialization and scoped config changes may update an implicit
    // Auto buffer before any picker exists. A prior manual choice stays manual.
    if (!explicit && normalizeEncoding(buffer.getEncoding()) === this.getDefaultEncoding(buffer)) {
      this.clearAutomatic(buffer);
    } else {
      this.chooseManual(buffer);
    }
  }

  didChangePath(buffer) {
    const bufferId = buffer.getId();
    if (
      this.recordBuffers.get(bufferId) === buffer &&
      (this.automaticEncodings.has(bufferId) || this.manualEncodings.has(bufferId))
    ) {
      this.chooseManual(buffer);
    } else {
      this.clearAutomatic(buffer);
    }
  }

  isAutomatic(buffer) {
    this.observeBuffer(buffer);
    const bufferId = buffer.getId();
    if (this.manualEncodings.has(bufferId)) return false;
    const encoding = normalizeEncoding(buffer.getEncoding());
    return this.automaticEncodings.has(bufferId)
      ? this.automaticEncodings.get(bufferId) === encoding
      : encoding === this.getDefaultEncoding(buffer);
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
    if (
      this.destroyed ||
      buffer.isDestroyed() ||
      normalizeEncoding(buffer.getEncoding()) !== encoding
    )
      return;
    this.observeBuffer(buffer);
    this.manualEncodings.delete(buffer.getId());
    this.automaticEncodings.set(buffer.getId(), encoding);
    this.recordBuffers.set(buffer.getId(), buffer);
  }

  serialize() {
    return this.serializeRecords(this.automaticEncodings);
  }

  rememberDefault(buffer) {
    if (this.destroyed || buffer.isDestroyed()) return;
    this.observeBuffer(buffer);
    this.clearAutomatic(buffer);
    this.manualEncodings.delete(buffer.getId());
    this.recordBuffers.delete(buffer.getId());
  }

  serializeManual() {
    return this.serializeRecords(this.manualEncodings, true);
  }

  serializeRecords(records, manual = false) {
    this.observeProjectBuffers();
    const buffers = new Map(lumine.project.getBuffers().map((buffer) => [buffer.getId(), buffer]));
    return Array.from(records, ([bufferId, encoding]) => ({
      bufferId,
      encoding: manual ? normalizeEncoding(buffers.get(bufferId)?.getEncoding()) : encoding,
    })).filter(({ bufferId, encoding }) => {
      const buffer = buffers.get(bufferId);
      return (
        buffer != null &&
        !buffer.isDestroyed() &&
        this.encodings[encoding] &&
        normalizeEncoding(buffer.getEncoding()) === encoding
      );
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

function normalizeEncoding(encoding) {
  return String(encoding ?? "")
    .toLowerCase()
    .replace(/[^0-9a-z]|:\d{4}$/g, "");
}
