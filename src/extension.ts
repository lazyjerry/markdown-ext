import * as vscode from 'vscode';

import { PreviewViewProvider } from './views/previewViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PreviewViewProvider(context.extensionUri, context.globalState);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(PreviewViewProvider.viewType, provider),
    vscode.commands.registerCommand('markdooown.show', () =>
      vscode.commands.executeCommand(`${PreviewViewProvider.viewType}.focus`),
    ),
  );
}

export function deactivate(): void {}
