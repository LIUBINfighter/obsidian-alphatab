import * as alphaTab from "@coderline/alphatab";

/**
 * 定义从 Obsidian CSS 变量中读取的颜色集接口
 */
interface ObsidianThemeColors {
	textColor: string;
	textMuted: string;
	textAccent: string;
	barLineColor: string;
	staffLineColor: string;
	noteColor: string;
	accentColor: string;
	fontFamily: string;
	fontSize: string;
}

/**
 * 从 DOM 中获取当前 Obsidian 主题的 CSS 变量值
 * @returns {ObsidianThemeColors} 包含颜色值的对象
 */
export function getObsidianThemeColors(): ObsidianThemeColors {
	const s = getComputedStyle(document.body);
	return {
		textColor: s.getPropertyValue("--text-normal").trim(),
		textMuted: s.getPropertyValue("--text-muted").trim(),
		textAccent: s.getPropertyValue("--interactive-accent").trim(),
		barLineColor: s.getPropertyValue("--background-modifier-border").trim(),
		staffLineColor: s.getPropertyValue("--background-modifier-border").trim(),
		noteColor: s.getPropertyValue("--text-normal").trim(),
		accentColor: s.getPropertyValue("--interactive-accent").trim(),
		fontFamily: s.getPropertyValue("--font-monospace").trim() || "Courier New, monospace",
		fontSize: s.getPropertyValue("--font-text-size").trim() || "14px",
	};
}

/**
 * 将 Obsidian 主题颜色应用到 AlphaTab 乐谱模型上
 * @param {alphaTab.model.Score} score - 要应用样式的乐谱对象
 * @param {ObsidianThemeColors} colors - 从 getObsidianThemeColors 获取的颜色对象
 */
export function applyThemeColorsToScore(
	score: alphaTab.model.Score,
	colors: ObsidianThemeColors
): void {
	if (!score) return;
	const toColor = (v: string) => alphaTab.model.Color.fromJson(v);

	// 1. 乐谱级样式
	const sc = new alphaTab.model.ScoreStyle();
	sc.fontFamily = colors.fontFamily;
	sc.fontSize = parseFloat(colors.fontSize);
	sc.colors.set(alphaTab.model.ScoreSubElement.Title, toColor(colors.textColor));
	sc.colors.set(alphaTab.model.ScoreSubElement.Artist, toColor(colors.textColor));
	sc.colors.set(alphaTab.model.ScoreSubElement.SubTitle, toColor(colors.textMuted));
	score.style = sc;

	// 2. 逐轨道/小节/声部应用
	for (const track of score.tracks) {
		const tstyle = new alphaTab.model.TrackStyle();
		tstyle.colors.set(alphaTab.model.TrackSubElement.TrackName, toColor(colors.accentColor));
		track.style = tstyle;

		for (const staff of track.staves) {
			for (const bar of staff.bars) {
				const bstyle = new alphaTab.model.BarStyle();
				bstyle.colors.set(alphaTab.model.BarSubElement.StandardNotationBarLines, toColor(colors.barLineColor));
				bar.style = bstyle;

				for (const voice of bar.voices) {
					const vstyle = new alphaTab.model.VoiceStyle();
					vstyle.colors.set(alphaTab.model.VoiceSubElement.Glyphs, toColor(colors.noteColor));
					voice.style = vstyle;
				}
			}
		}
	}
	console.debug("[ThemeAdapter] Applied theme to score.");
}
