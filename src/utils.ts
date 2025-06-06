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
