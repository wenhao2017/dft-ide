/**
 * 封装 VS Code Webview API
 * 确保 acquireVsCodeApi 只调用一次，并导出全局可用的 vscode 对象
 */

interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// acquireVsCodeApi 只能调用一次，缓存结果
const vscode: VsCodeApi = acquireVsCodeApi();

export default vscode;
