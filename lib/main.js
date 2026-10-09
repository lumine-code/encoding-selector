const EncodingStatusView = require("./encoding-status-view");
const EncodingSelection = require("./encoding-selection");
const { Disposable } = require("lumine");

const encodings = {
  utf8: {
    list: "UTF-8",
    status: "UTF-8",
  },
  utf16le: {
    list: "UTF-16 LE",
    status: "UTF-16 LE",
  },
  utf16be: {
    list: "UTF-16 BE",
    status: "UTF-16 BE",
  },
  windows1252: {
    list: "Western (Windows 1252)",
    status: "Windows 1252",
  },
  iso88591: {
    list: "Western (ISO 8859-1)",
    status: "ISO 8859-1",
  },
  iso88593: {
    list: "Western (ISO 8859-3)",
    status: "ISO 8859-3",
  },
  iso885915: {
    list: "Western (ISO 8859-15)",
    status: "ISO 8859-15",
  },
  macroman: {
    list: "Western (Mac Roman)",
    status: "Mac Roman",
  },
  cp437: {
    list: "DOS (CP 437)",
    status: "CP437",
  },
  cp850: {
    list: "DOS (CP 850)",
    status: "CP850",
  },
  windows1256: {
    list: "Arabic (Windows 1256)",
    status: "Windows 1256",
  },
  iso88596: {
    list: "Arabic (ISO 8859-6)",
    status: "ISO 8859-6",
  },
  windows1257: {
    list: "Baltic (Windows 1257)",
    status: "Windows 1257",
  },
  iso88594: {
    list: "Baltic (ISO 8859-4)",
    status: "ISO 8859-4",
  },
  windows1250: {
    list: "Central European (Windows 1250)",
    status: "Windows 1250",
  },
  iso88592: {
    list: "Central European (ISO 8859-2)",
    status: "ISO 8859-2",
  },
  windows1251: {
    list: "Cyrillic (Windows 1251)",
    status: "Windows 1251",
  },
  cp866: {
    list: "Cyrillic (CP 866)",
    status: "CP 866",
  },
  iso88595: {
    list: "Cyrillic (ISO 8859-5)",
    status: "ISO 8859-5",
  },
  koi8r: {
    list: "Cyrillic (KOI8-R)",
    status: "KOI8-R",
  },
  koi8u: {
    list: "Cyrillic (KOI8-U)",
    status: "KOI8-U",
  },
  iso885913: {
    list: "Estonian (ISO 8859-13)",
    status: "ISO 8859-13",
  },
  windows1253: {
    list: "Greek (Windows 1253)",
    status: "Windows 1253",
  },
  iso88597: {
    list: "Greek (ISO 8859-7)",
    status: "ISO 8859-7",
  },
  windows1255: {
    list: "Hebrew (Windows 1255)",
    status: "Windows 1255",
  },
  iso88598: {
    list: "Hebrew (ISO 8859-8)",
    status: "ISO 8859-8",
  },
  iso885916: {
    list: "Romanian (ISO 8859-16)",
    status: "ISO 8859-16",
  },
  windows1254: {
    list: "Turkish (Windows 1254)",
    status: "Windows 1254",
  },
  iso88599: {
    list: "Turkish (ISO 8859-9)",
    status: "ISO 8859-9",
  },
  windows1258: {
    list: "Vietnamese (Windows 1258)",
    status: "Windows 1258",
  },
  gbk: {
    list: "Chinese (GBK)",
    status: "GBK",
  },
  gb18030: {
    list: "Chinese (GB18030)",
    status: "GB18030",
  },
  cp950: {
    list: "Traditional Chinese (Big5)",
    status: "Big5",
  },
  big5hkscs: {
    list: "Traditional Chinese (Big5-HKSCS)",
    status: "Big5-HKSCS",
  },
  shiftjis: {
    list: "Japanese (Shift JIS)",
    status: "Shift JIS",
  },
  cp932: {
    list: "Japanese (CP 932)",
    status: "CP 932",
  },
  eucjp: {
    list: "Japanese (EUC-JP)",
    status: "EUC-JP",
  },
  euckr: {
    list: "Korean (EUC-KR)",
    status: "EUC-KR",
  },
};

const posixOnlyEncodings = {
  iso885914: {
    list: "Celtic (ISO 8859-14)",
    status: "ISO 8859-14",
  },
  iso885910: {
    list: "Nordic (ISO 8859-10)",
    status: "ISO 8859-10",
  },
};

let encodingListView = null;
let encodingStatusViews = null;
let commandSubscription = null;
let encodingSelection = null;

function isEncodingReadOnly(editor) {
  return editor?.isEncodingReadOnly?.() === true;
}

function readOnlyEncodingMessage(editor) {
  const encoding = editor
    ?.getEncoding?.()
    ?.toLowerCase()
    .replace(/[^0-9a-z]|:\d{4}$/g, "");
  const label = encodings[encoding]?.list || encoding || "the current";
  return `This file format requires ${label} encoding.`;
}

module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "encoding-selector",
      tips: [
        "You can change the character encoding of the current file with {{ 'encoding-selector:show' | keystroke }}",
      ],
    };
  },

  activate(state = {}) {
    encodingStatusViews = new Map();
    if (process.platform !== "win32") {
      Object.assign(encodings, posixOnlyEncodings);
    }
    encodingSelection = new EncodingSelection(
      encodings,
      state?.automaticEncodings,
      state?.manualEncodings,
    );

    // On the workspace, because Edit > Select Encoding dispatches at whatever
    // holds focus. The picker captures the active file editor when it opens —
    // the encoding is a property of the file, so inside a notebook it
    // describes the backing .ipynb — and there has to be one before it opens.
    commandSubscription = lumine.commands.add("lumine-workspace", "encoding-selector:show", () => {
      const editor = lumine.workspace.getActiveFileTextEditor();
      if (!editor) return;
      if (isEncodingReadOnly(editor)) {
        lumine.notifications.addInfo(readOnlyEncodingMessage(editor));
        return;
      }
      if (!encodingListView) {
        const EncodingListView = require("./encoding-list-view");
        encodingListView = new EncodingListView(encodings, [], encodingSelection);
      }
      return encodingListView.toggle(editor);
    });
  },

  serialize() {
    return {
      automaticEncodings: encodingSelection?.serialize() || [],
      manualEncodings: encodingSelection?.serializeManual() || [],
    };
  },

  restoreState(state = {}) {
    encodingSelection?.restoreState(state?.automaticEncodings, state?.manualEncodings);
    encodingListView?.cancel();
  },

  deactivate() {
    const command = commandSubscription;
    const views = encodingStatusViews;
    const list = encodingListView;
    const selection = encodingSelection;
    commandSubscription = null;
    encodingStatusViews = null;
    encodingListView = null;
    encodingSelection = null;
    command?.dispose();
    if (views) {
      const states = [...views.values()];
      views.clear();
      for (const state of states) state.retired = true;
      for (const state of states) state.view?.destroy();
    }
    list?.destroy();
    selection?.destroy();
  },

  consumeStatusBar(statusBar) {
    const views = encodingStatusViews;
    if (!views) return new Disposable();
    let state = views.get(statusBar);
    if (!state) {
      state = { leases: 0, retired: false, view: null };
      views.set(statusBar, state);
      try {
        state.view = new EncodingStatusView(statusBar, encodings, {
          isEncodingReadOnly,
          readOnlyEncodingMessage,
        });
        if (state.retired) state.view.destroy();
        else state.view.attach();
      } catch (error) {
        state.retired = true;
        if (views.get(statusBar) === state) views.delete(statusBar);
        state.view?.destroy();
        throw error;
      }
    }
    state.leases++;
    return new Disposable(() => {
      if (state.retired || --state.leases > 0) return;
      state.retired = true;
      if (views.get(statusBar) === state) views.delete(statusBar);
      state.view.destroy();
    });
  },
};
