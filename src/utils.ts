// utils.ts
// 通用辅助函数

export function saveToFile(fileName: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[AlphaTab Debug] File '${fileName}' saved.`);
}

// 资源 URL 生成辅助
export function getPluginAssetHttpUrl(pluginInstance: any, pluginId: string, assetPath: string): string {
    const resourceServer = pluginInstance.getResourceServer?.();
    if (!resourceServer) {
        console.error('[AlphaTab Debug] Resource server not available');
        throw new Error('Resource server not initialized');
    }
    const baseUrl = resourceServer.getBaseUrl();
    const normalizedAssetPath = assetPath.startsWith("/") ? assetPath.substring(1) : assetPath;
    const fullUrl = `${baseUrl}/${normalizedAssetPath}`;
    return fullUrl;
}
