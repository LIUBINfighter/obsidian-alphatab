export class FontManager {
	static readonly FONT_STYLE_ELEMENT_ID = "alphatab-manual-font-styles";

	static injectFontFaces(fontData: Record<string, string>, fontFamilies: string[]): boolean {
		this.removeInjectedFontFaces();
		const sources: string[] = [];
		if (fontData["woff2"]) sources.push(`url('${fontData["woff2"]}') format('woff2')`);
		if (fontData["woff"]) sources.push(`url('${fontData["woff"]}') format('woff')`);
		let css = "";
		fontFamilies.forEach((fontFamily) => {
			css += `@font-face {\n  font-family: '${fontFamily}';\n  src: ${sources.join(",\n       ")};\n  font-display: block;\n}\n\n`;
		});
		try {
			const styleEl = document.createElement("style");
			styleEl.id = this.FONT_STYLE_ELEMENT_ID;
			styleEl.type = "text/css";
			styleEl.textContent = css;
			document.head.appendChild(styleEl);
			return true;
		} catch {
			return false;
		}
	}

	static removeInjectedFontFaces() {
		const el = document.getElementById(this.FONT_STYLE_ELEMENT_ID);
		if (el) el.remove();
	}

	static triggerFontPreload(fontFamilies: string[], fontUrl: string) {
		fontFamilies.forEach((fontFamily) => {
			if (typeof FontFace !== "undefined" && document.fonts) {
				const font = new FontFace(fontFamily, `url(${fontUrl})`, { display: 'block' });
				font.load().then((loadedFont) => {
					// @ts-ignore
					document.fonts.add(loadedFont);
				});
			} else {
				const testEl = document.createElement("div");
				testEl.style.fontFamily = fontFamily;
				testEl.style.position = "absolute";
				testEl.style.left = "-9999px";
				testEl.style.visibility = "hidden";
				testEl.textContent = "test";
				document.body.appendChild(testEl);
				setTimeout(() => { if (testEl.parentElement) testEl.remove(); }, 100);
			}
		});
	}
}
