import * as vscode from 'vscode';

import type { TabTarget } from '../core/follow';
import { decideFollow } from '../core/follow';
import { classifyLink } from '../core/links';
import type { ClientMessage, HostMessage, PreviewMode } from '../shared/protocol';
import { isClientMessage, isPreviewMode } from '../shared/protocol';

/** 打字時合併更新；大檔案重算成本高，間隔拉長。 */
const RENDER_DELAY_MS = 120;
const LARGE_DOC_RENDER_DELAY_MS = 400;
const LARGE_DOC_CHARS = 200_000;
const MODE_KEY = 'markdooown.mode';

export class PreviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'markdooown.preview';

  private view: vscode.WebviewView | undefined;
  /** 目前預覽的文件；undefined 表示面板處於待機，不追蹤任何文件。 */
  private doc: vscode.TextDocument | undefined;
  private idleReason: 'none' | 'notMarkdown' = 'none';
  /** 只在面板可見時存在的訂閱；面板收起就全數釋放，讓擴充回到完全不動作的狀態。 */
  private liveSubscriptions: vscode.Disposable[] = [];
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly roots = new Map<string, vscode.Uri>();
  /** 每次跟隨都遞增；非同步載入文件回來時序號已變，代表使用者又切走了，結果作廢。 */
  private followSeq = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: vscode.Memento,
  ) {}

  private get mode(): PreviewMode {
    const saved = this.state.get<unknown>(MODE_KEY);
    return isPreviewMode(saved) ? saved : 'basic';
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');
    this.roots.set(mediaUri.toString(), mediaUri);
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      this.roots.set(folder.uri.toString(), folder.uri);
    }
    this.applyOptions();
    webviewView.webview.html = this.getHtml(webviewView.webview, mediaUri);

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (isClientMessage(message)) {
        void this.handleMessage(message);
      }
    });
    webviewView.onDidChangeVisibility(() => this.syncLiveState());
    webviewView.onDidDispose(() => {
      this.stopLive();
      if (this.view === webviewView) {
        this.view = undefined;
      }
    });

    this.syncLiveState();
  }

  dispose(): void {
    this.stopLive();
  }

  private syncLiveState(): void {
    if (this.view?.visible) {
      this.startLive();
    } else {
      this.stopLive();
    }
  }

  private startLive(): void {
    if (this.liveSubscriptions.length > 0) {
      return;
    }
    const follow = () => void this.followActiveTab();
    this.liveSubscriptions.push(
      // onDidChangeTabs 在每次變髒／存檔都會觸發，followActiveTab 對同一份文件會直接返回。
      vscode.window.tabGroups.onDidChangeTabs(follow),
      vscode.window.tabGroups.onDidChangeTabGroups(follow),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === this.doc && event.contentChanges.length > 0) {
          this.scheduleRender();
        }
      }),
      vscode.workspace.onDidCloseTextDocument((closed) => {
        // 以預覽模式開啟的 .md 是我們自己 openTextDocument 載入的，VS Code 會在沒有編輯器引用時回收它；
        // 分頁還開著就重新載入，而不是讓預覽消失。
        if (closed === this.doc) {
          this.doc = undefined;
          void this.followActiveTab().then(() => {
            if (!this.doc) {
              this.setIdle('none', true);
            }
          });
        }
      }),
    );
    void this.followActiveTab();
  }

  private stopLive(): void {
    for (const sub of this.liveSubscriptions) {
      sub.dispose();
    }
    this.liveSubscriptions = [];
    this.clearTimer();
  }

  private async followActiveTab(): Promise<void> {
    const seq = ++this.followSeq;
    const uri = activeTabUri();
    if (uri && this.doc && uri.toString() === this.doc.uri.toString()) {
      return;
    }
    const loaded = uri && vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
    const target: TabTarget | undefined = uri && { scheme: uri.scheme, path: uri.path, languageId: loaded?.languageId };
    switch (decideFollow(target)) {
      case 'show': {
        let doc = loaded;
        if (!doc) {
          try {
            doc = await vscode.workspace.openTextDocument(uri!);
          } catch {
            return;
          }
        }
        if (seq === this.followSeq && this.view?.visible) {
          this.show(doc);
        }
        break;
      }
      case 'idle':
        this.setIdle('notMarkdown');
        break;
      case 'keep':
        break;
    }
  }

  private show(doc: vscode.TextDocument): void {
    if (doc === this.doc) {
      return;
    }
    this.doc = doc;
    this.ensureRoot(doc);
    this.clearTimer();
    this.postCurrent();
  }

  private setIdle(reason: 'none' | 'notMarkdown', force = false): void {
    if (!force && !this.doc && this.idleReason === reason) {
      return;
    }
    this.doc = undefined;
    this.idleReason = reason;
    this.clearTimer();
    this.postCurrent();
  }

  private scheduleRender(): void {
    this.clearTimer();
    const delay = (this.doc?.getText().length ?? 0) > LARGE_DOC_CHARS ? LARGE_DOC_RENDER_DELAY_MS : RENDER_DELAY_MS;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.postCurrent();
    }, delay);
  }

  private clearTimer(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }
  }

  private postCurrent(): void {
    const view = this.view;
    if (!view?.visible) {
      return;
    }
    // 面板收起期間不追蹤關檔事件，重新顯示時才發現文件已關閉。
    if (this.doc?.isClosed) {
      this.doc = undefined;
      this.idleReason = 'none';
    }
    const doc = this.doc;
    if (!doc) {
      this.post({ type: 'idle', reason: this.idleReason });
      return;
    }
    const dir = documentDir(doc);
    this.post({
      type: 'render',
      docKey: doc.uri.toString(),
      fileName: doc.isUntitled ? doc.uri.path : vscode.workspace.asRelativePath(doc.uri, false),
      text: doc.getText(),
      baseUri: dir ? `${view.webview.asWebviewUri(dir).toString()}/` : '',
      mode: this.mode,
    });
  }

  private post(message: HostMessage): void {
    void this.view?.webview.postMessage(message);
  }

  /** 工作區外的檔案也要能顯示同目錄的圖片，把它的目錄補進可讀取的根目錄。 */
  private ensureRoot(doc: vscode.TextDocument): void {
    const dir = documentDir(doc);
    if (!dir) {
      return;
    }
    const dirPath = dir.toString();
    for (const key of this.roots.keys()) {
      if (dirPath === key || dirPath.startsWith(`${key}/`)) {
        return;
      }
    }
    this.roots.set(dirPath, dir);
    this.applyOptions();
  }

  private applyOptions(): void {
    if (this.view) {
      this.view.webview.options = { enableScripts: true, localResourceRoots: [...this.roots.values()] };
    }
  }

  private async handleMessage(message: ClientMessage): Promise<void> {
    if (message.type === 'ready') {
      this.postCurrent();
      return;
    }
    if (message.type === 'setMode') {
      if (message.mode !== this.mode) {
        await this.state.update(MODE_KEY, message.mode);
        this.postCurrent();
      }
      return;
    }
    const target = classifyLink(message.href);
    if (!target || target.kind === 'anchor') {
      return;
    }
    if (target.kind === 'external') {
      await vscode.env.openExternal(vscode.Uri.parse(target.url));
      return;
    }
    const doc = this.doc;
    const base = target.path.startsWith('/')
      ? (doc && vscode.workspace.getWorkspaceFolder(doc.uri)?.uri) ?? vscode.Uri.file('/')
      : doc && documentDir(doc);
    if (!base) {
      return;
    }
    const uri = vscode.Uri.joinPath(base, target.path);
    try {
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch {
      void vscode.window.showWarningMessage(`markdooown：無法開啟 ${uri.fsPath}`);
    }
  }

  private getHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'styles.css'));
    const enhancedUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'enhanced.js'));
    const katexCssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'katex', 'katex.min.css'));
    const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'vendor', 'mermaid.min.js'));
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      // Markdown 內嵌的 HTML 常帶 style 屬性，樣式放行；腳本仍只認 nonce。
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>markdooown</title>
</head>
<body data-enhanced-src="${enhancedUri}" data-katex-css="${katexCssUri}" data-mermaid-src="${mermaidUri}">
  <header id="bar">
    <span id="file"></span>
    <div class="modes" role="group" aria-label="預覽模式">
      <button type="button" data-mode="basic" title="CommonMark＋GFM，最輕量">預覽</button>
      <button type="button" data-mode="enhanced" title="另支援數學式、註腳、Mermaid 圖表">增強預覽</button>
    </div>
  </header>
  <main id="content" class="markdown-body"></main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** 文字、預覽（custom editor）、比對（取修改後那側）三種分頁都對應得到檔案。 */
function activeTabUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  return undefined;
}

function documentDir(doc: vscode.TextDocument): vscode.Uri | undefined {
  if (doc.isUntitled) {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }
  return vscode.Uri.joinPath(doc.uri, '..');
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
