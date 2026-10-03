import { randomBytes } from 'node:crypto';

import * as vscode from 'vscode';

import type { TabTarget } from '../core/follow';
import { decideFollow, isPreviewStale } from '../core/follow';
import { classifyLink, isWithin } from '../core/links';
import type { ClientMessage, HostMessage } from '../shared/protocol';
import { isClientMessage } from '../shared/protocol';

/** 打字時合併更新；大檔案重算成本高，間隔拉長。 */
const RENDER_DELAY_MS = 120;
const LARGE_DOC_RENDER_DELAY_MS = 400;
const LARGE_DOC_CHARS = 200_000;
const AUTO_REFRESH_KEY = 'markdooown.autoRefresh';
const REMOTE_IMAGES_SETTING = 'markdooown.allowRemoteImages';

/**
 * 畫面上正在顯示的東西。關掉自動刷新時畫面要停在最後的狀態，
 * 而文件可能已經被改、被關（以預覽模式開啟的 .md 沒有編輯器引用時會被 VS Code 回收），
 * 所以保留當時的文字快照，webview 重載後照樣重現同一個畫面。
 */
type Shown =
  | { kind: 'render'; docKey: string; fileName: string; text: string; dir: vscode.Uri | undefined }
  | { kind: 'idle'; reason: 'none' | 'notMarkdown' };

export class PreviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'markdooown.preview';

  private view: vscode.WebviewView | undefined;
  /** 目前預覽的文件；undefined 表示面板處於待機，不追蹤任何文件。 */
  private doc: vscode.TextDocument | undefined;
  private idleReason: 'none' | 'notMarkdown' = 'none';
  private shown: Shown | undefined;
  /** 顯示的快照產生之後，那份文件又被改過。 */
  private edited = false;
  /** 只在面板可見時存在的訂閱；面板收起就全數釋放，讓擴充回到完全不動作的狀態。 */
  private liveSubscriptions: vscode.Disposable[] = [];
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly roots = new Map<string, vscode.Uri>();
  /** 每次跟隨都遞增；非同步載入文件回來時序號已變，代表使用者又切走了，結果作廢。 */
  private followSeq = 0;
  /** 目前 HTML 的 CSP 是依哪個設定值產生的；設定改變才重建 HTML（重建會整頁重載）。 */
  private remoteImages: boolean | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: vscode.Memento,
  ) {}

  private get autoRefresh(): boolean {
    return this.state.get<unknown>(AUTO_REFRESH_KEY) === true;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');
    this.roots.set(mediaUri.toString(), mediaUri);
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      this.roots.set(folder.uri.toString(), folder.uri);
    }
    this.applyOptions();
    this.remoteImages = allowRemoteImages();
    webviewView.webview.html = this.getHtml(webviewView.webview, mediaUri, this.remoteImages);

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
        if (event.document !== this.doc || event.contentChanges.length === 0) {
          return;
        }
        if (this.autoRefresh) {
          this.scheduleRender();
        } else {
          this.edited = true;
          this.postStatus();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(REMOTE_IMAGES_SETTING)) {
          this.refreshCsp();
        }
      }),
      vscode.workspace.onDidCloseTextDocument((closed) => {
        // 以預覽模式開啟的 .md 是我們自己 openTextDocument 載入的，VS Code 會在沒有編輯器引用時回收它；
        // 分頁還開著就重新載入，而不是讓預覽消失。
        if (closed !== this.doc) {
          return;
        }
        this.doc = undefined;
        if (!this.autoRefresh) {
          // 畫面停在快照上，等使用者自己按刷新。
          this.postStatus();
          return;
        }
        void this.followActiveTab().then(() => {
          if (!this.doc) {
            this.setIdle('none', true);
          }
        });
      }),
    );
    // 面板收起期間不訂閱設定變更，重新顯示時補檢查。
    this.refreshCsp();
    void this.followActiveTab();
  }

  /** 重設 html 會重載 webview，重載後的 ready 握手會重送目前的預覽。 */
  private refreshCsp(): void {
    const remoteImages = allowRemoteImages();
    if (!this.view || remoteImages === this.remoteImages) {
      return;
    }
    this.remoteImages = remoteImages;
    this.view.webview.html = this.getHtml(this.view.webview, vscode.Uri.joinPath(this.extensionUri, 'media'), remoteImages);
  }

  private stopLive(): void {
    for (const sub of this.liveSubscriptions) {
      sub.dispose();
    }
    this.liveSubscriptions = [];
    this.clearTimer();
  }

  /** `force` 來自使用者按下刷新（或剛打開自動刷新）：即使分頁沒變也重畫一次。 */
  private async followActiveTab(force = false): Promise<void> {
    if (!this.autoRefresh && !force) {
      this.postStatus();
      return;
    }
    const seq = ++this.followSeq;
    const uri = activeTabUri();
    if (!force && uri && this.doc && uri.toString() === this.doc.uri.toString()) {
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
          this.show(doc, force);
        }
        break;
      }
      case 'idle':
        this.setIdle('notMarkdown', force);
        break;
      case 'keep':
        // 分頁沒有對應檔案（設定頁、終端機分頁）；手動刷新時就重畫目前這份。
        if (force && this.doc) {
          this.postCurrent();
        } else if (force) {
          this.postStatus();
        }
        break;
    }
  }

  private show(doc: vscode.TextDocument, force = false): void {
    if (doc === this.doc && !force) {
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

  /** 依目前追蹤的文件產生新的快照並送出。 */
  private postCurrent(): void {
    if (!this.view?.visible) {
      return;
    }
    // 面板收起期間不追蹤關檔事件，重新顯示時才發現文件已關閉。
    if (this.doc?.isClosed) {
      this.doc = undefined;
      this.idleReason = 'none';
    }
    const doc = this.doc;
    this.shown = doc
      ? {
          kind: 'render',
          docKey: doc.uri.toString(),
          fileName: doc.isUntitled ? doc.uri.path : vscode.workspace.asRelativePath(doc.uri, false),
          text: doc.getText(),
          dir: documentDir(doc),
        }
      : { kind: 'idle', reason: this.idleReason };
    this.edited = false;
    this.postShown();
    this.postStatus();
  }

  /** 重送目前的快照；webview 重載後要靠它回到原本的畫面。 */
  private postShown(): void {
    const view = this.view;
    const shown = this.shown;
    if (!view?.visible || !shown) {
      return;
    }
    if (shown.kind === 'idle') {
      this.post({ type: 'idle', reason: shown.reason });
      return;
    }
    this.post({
      type: 'render',
      docKey: shown.docKey,
      fileName: shown.fileName,
      text: shown.text,
      baseUri: shown.dir ? `${view.webview.asWebviewUri(shown.dir).toString()}/` : '',
    });
  }

  private postStatus(): void {
    const autoRefresh = this.autoRefresh;
    this.post({ type: 'status', autoRefresh, stale: autoRefresh ? false : this.computeStale() });
  }

  private computeStale(): boolean {
    const uri = activeTabUri();
    const loaded = uri && vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
    const target: TabTarget | undefined = uri && { scheme: uri.scheme, path: uri.path, languageId: loaded?.languageId };
    const shownDocKey = this.shown ? (this.shown.kind === 'render' ? this.shown.docKey : null) : undefined;
    return isPreviewStale(decideFollow(target), uri?.toString(), shownDocKey, this.edited);
  }

  /** 解析連結用的基準目錄；文件已被回收時退回快照裡記下的目錄。 */
  private currentDir(): vscode.Uri | undefined {
    if (this.doc) {
      return documentDir(this.doc);
    }
    return this.shown?.kind === 'render' ? this.shown.dir : undefined;
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
      // 重載前顯示過東西就重現同一個畫面，什麼都還沒顯示過才去跟隨目前的分頁。
      if (this.shown) {
        this.postShown();
        this.postStatus();
      } else {
        await this.followActiveTab(true);
      }
      return;
    }
    if (message.type === 'refresh') {
      await this.followActiveTab(true);
      return;
    }
    if (message.type === 'setAutoRefresh') {
      await this.state.update(AUTO_REFRESH_KEY, message.value);
      // 打開自動刷新就立刻追上目前的分頁；關掉只要更新按鈕狀態。
      if (message.value) {
        await this.followActiveTab(true);
      } else {
        this.postStatus();
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
    const dir = this.currentDir();
    const base = target.path.startsWith('/')
      ? (dir && vscode.workspace.getWorkspaceFolder(dir)?.uri) ?? vscode.Uri.file('/')
      : dir;
    if (!base) {
      return;
    }
    const uri = vscode.Uri.joinPath(base, target.path);
    if (!isAllowedLinkTarget(uri, dir)) {
      void vscode.window.showWarningMessage(`markdooown：連結指向工作區與文件目錄以外的位置，已略過 ${uri.fsPath}`);
      return;
    }
    try {
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch {
      void vscode.window.showWarningMessage(`markdooown：無法開啟 ${uri.fsPath}`);
    }
  }

  private getHtml(webview: vscode.Webview, mediaUri: vscode.Uri, remoteImages: boolean): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'styles.css'));
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource}${remoteImages ? ' https:' : ''} data:`,
      // Markdown 內嵌的 HTML 常帶 style 屬性，樣式放行；腳本仍只認 nonce。
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      "base-uri 'none'",
      "form-action 'none'",
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
<body>
  <header id="bar">
    <span id="file"><span id="file-dir"></span><span id="file-base"></span></span>
    <div class="search">
      <input type="text" id="query" placeholder="搜尋" aria-label="在預覽中搜尋" title="⌘F／Ctrl+F 聚焦；Enter 下一個、Shift+Enter 上一個、Esc 清除" spellcheck="false" autocomplete="off">
      <span id="count" aria-live="polite"></span>
      <button type="button" id="prev" disabled title="上一個 (Shift+Enter)" aria-label="上一個">↑</button>
      <button type="button" id="next" disabled title="下一個 (Enter)" aria-label="下一個">↓</button>
    </div>
    <div class="actions">
      <button type="button" id="auto" aria-pressed="false" title="切換分頁或編輯時自動更新預覽；關閉時畫面停在最後一次的內容">自動刷新</button>
      <button type="button" id="refresh" aria-pressed="true" title="更新到目前分頁的內容">預覽</button>
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

/** 連結只能開到某個工作區資料夾內，或目前文件所在目錄之下；`..` 已由 joinPath 解析掉。 */
function isAllowedLinkTarget(uri: vscode.Uri, dir: vscode.Uri | undefined): boolean {
  if (vscode.workspace.getWorkspaceFolder(uri)) {
    return true;
  }
  return !!dir && isWithin(uri.toString(), dir.toString());
}

function allowRemoteImages(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(REMOTE_IMAGES_SETTING, true);
}

function createNonce(): string {
  return randomBytes(16).toString('base64');
}
