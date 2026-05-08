const PLUGIN_ID = 'zotero-copilot@xiangweiw.dev';

let registered = false;

export function registerPrefsPane(rootURI: string): void {
  if (registered) return;
  try {
    const Z: any = Zotero;
    if (!Z || !Z.PreferencePanes || typeof Z.PreferencePanes.register !== 'function') {
      try { Zotero.debug('[zotero-copilot] PreferencePanes API unavailable', 1); } catch {}
      return;
    }
    Z.PreferencePanes.register({
      pluginID: PLUGIN_ID,
      src: rootURI + 'content/prefs/panel.xhtml',
      label: 'DeepRead',
    });
    registered = true;
  } catch (err) {
    try { Zotero.debug('[zotero-copilot] registerPrefsPane failed: ' + err, 1); } catch {}
  }
}
