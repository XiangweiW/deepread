import * as React from 'react';
import { Chat, ChatProps } from './chat';
import { Prefs } from '../prefs/manager';

export type SidebarProps = {
  itemID?: number;
  collectionID?: number;
  onClose?: () => void;
  chatProps?: ChatProps;
};

export type ChatPlaceholderProps = {
  itemID?: number;
  collectionID?: number;
};

export function ChatPlaceholder(props: ChatPlaceholderProps): JSX.Element {
  const { itemID, collectionID } = props;
  let contextLabel = 'No selection';
  if (typeof itemID === 'number') {
    contextLabel = `Item: ${itemID}`;
  } else if (typeof collectionID === 'number') {
    contextLabel = `Collection: ${collectionID}`;
  }
  return (
    <div style={styles.placeholder}>
      <div style={styles.placeholderContext}>{contextLabel}</div>
      <div style={styles.placeholderMessage}>
        Chat is not configured. Set your API key in DeepRead preferences.
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const { itemID, collectionID, onClose, chatProps } = props;
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return Prefs.getSidebarCollapsed();
    } catch {
      return false;
    }
  });
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    try {
      const el = rootRef.current;
      if (!el) return;
      const outer = el.closest('#zotero-copilot-sidebar') as HTMLElement | null;
      try { (globalThis as any).Zotero?.debug?.('[zotero-copilot] sidebar collapsed=' + collapsed + ' outer=' + (!!outer), 3); } catch {}
      if (!outer) return;
      if (collapsed) {
        outer.style.width = '32px';
      } else {
        outer.style.width = '380px';
      }
    } catch {
    }
  }, [collapsed]);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        Prefs.setSidebarCollapsed(next);
      } catch {
      }
      return next;
    });
  }, []);

  const rootStyle: React.CSSProperties = collapsed
    ? { ...styles.root, ...styles.rootCollapsed }
    : styles.root;
  const headerStyle: React.CSSProperties = collapsed
    ? { ...styles.header, ...styles.headerCollapsed }
    : styles.header;

  if (collapsed) {
    return (
      <div data-zotero-copilot-root="" ref={rootRef} style={rootStyle}>
        <div style={headerStyle}>
          <button
            type="button"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            onClick={toggleCollapsed}
            style={styles.expandBar}
          >
            {'▶'}
          </button>
        </div>
        <div style={{ ...styles.body, display: 'none' }} />
      </div>
    );
  }

  return (
    <div data-zotero-copilot-root="" ref={rootRef} style={rootStyle}>
      <div style={headerStyle}>
        <button
          type="button"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          onClick={toggleCollapsed}
          style={styles.collapseButton}
        >
          {'◀'}
        </button>
        <span style={styles.title}>DeepRead</span>
        {onClose ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={styles.closeButton}
          >
            {'×'}
          </button>
        ) : (
          <span style={styles.headerSpacer} />
        )}
      </div>
      <div style={styles.body}>
        {chatProps ? (
          <Chat {...chatProps} />
        ) : (
          <ChatPlaceholder itemID={itemID} collectionID={collectionID} />
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    minWidth: 320,
    maxWidth: 480,
    boxSizing: 'border-box',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
    fontSize: 13,
    color: '#1a1a1a',
    background: '#ffffff',
  },
  rootCollapsed: {
    width: 32,
    minWidth: 32,
    maxWidth: 32,
    marginLeft: 'auto',
    borderLeft: '1px solid #e0e0e0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 32,
    padding: '0 8px',
    borderBottom: '1px solid #e0e0e0',
    flex: '0 0 auto',
  },
  headerCollapsed: {
    padding: 0,
    justifyContent: 'center',
  },
  title: {
    fontWeight: 600,
    fontSize: 13,
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: '2px 6px',
    color: '#555',
  },
  collapseButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 11,
    lineHeight: 1,
    padding: '2px 6px',
    color: '#555',
  },
  expandBar: {
    width: '100%',
    height: '100%',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 11,
    lineHeight: 1,
    padding: 0,
    color: '#555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 16,
    display: 'inline-block',
  },
  body: {
    flex: '1 1 auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  placeholder: {
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 12,
    gap: 8,
    color: '#444',
  },
  placeholderContext: {
    fontSize: 12,
    fontWeight: 500,
    color: '#666',
  },
  placeholderMessage: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
  },
};
