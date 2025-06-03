// TabView.ts
import { App, FileView, Modal, Setting, TFile, WorkspaceLeaf } from "obsidian";
import * as alphaTab from "@coderline/alphatab";
import {
  model,
  type AlphaTabApi,
  type Settings,
  type RenderingResources,
} from "@coderline/alphatab";

export const VIEW_TYPE_TAB = "tab-view";

export class TracksModal extends Modal {
  tracks: AlphaTabApi["tracks"];
  renderTracks: Set<AlphaTabApi["tracks"][0]>;
  onChange?: (tracks?: AlphaTabApi["tracks"]) => void;

  constructor(
    app: App,
    tracks: TracksModal["tracks"],
    onChange?: TracksModal["onChange"]
  ) {
    super(app);
    this.tracks = tracks;
    this.onChange = onChange;
    this.renderTracks = new Set([tracks[0]]);
    this.modalEl.addClass("tracks-modal");
  }
  onOpen = () => {
    this.tracks.forEach((track) => {
      new Setting(this.contentEl)
        .setName(track.name)
        .setDesc(track.shortName)
        .addToggle((toggle) => {
          toggle
            .setValue(this.renderTracks.has(track))
            .onChange((value) => {
              if (value) {
                this.renderTracks.add(track);
              } else {
                this.renderTracks.delete(track);
              }
              this.onSelectTrack();
            });
        });
    });
  }

  onSelectTrack = () => {
    const selectTracks = Array.from(this.renderTracks).sort(
      (a, b) => a.index - b.index
    );
    this.onChange?.(selectTracks)
  };

  onClose = () => {
    this.contentEl.empty();
  }

  setTracks(tracks: AlphaTabApi["tracks"]) {
    this.tracks = tracks;
  }
  
  setRenderTracks(tracks: AlphaTabApi["tracks"]) {
    this.renderTracks = new Set(tracks);
  }
}

export class TabView extends FileView {
  score: model.Score;
  alphaTabSettings: Settings;
  renderTracks: AlphaTabApi["tracks"];
  renderWidth = 800;

  darkMode: boolean;
  tracksModal: TracksModal;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);

    this.containerEl.addClass("gtp-preview-container");
    this.tracksModal = new TracksModal(this.app, [], this.onChangeTracks);
    this.addAction("music", "Set instrument", () =>
      this.tracksModal.open()
    );
    this.addAction("download", "Download midi file", this.downloadMidi);
    // this.addAction("play", "Play", this.playMidi);
  }

  getViewType(): string {
    return VIEW_TYPE_TAB;
  }

  getDisplayText() {
    if (this.score) {
      return `${this.score.title} - ${this.score.artist}`;
    }
    return super.getDisplayText();
  }

  parseTabContent() {
    this.darkMode = document.body?.className?.includes?.("theme-dark");
    this.renderWidth = Math.min(this.contentEl.clientWidth || 800, 800);
    
    // 1. Setup settings
    const playerSettings = {
      enablePlayer: true,
      enableCursor: true,
      enableUserInteraction: true,
      scrollElement: this.contentEl,
    };
    
    this.alphaTabSettings = new alphaTab.Settings({
      display: {
        scale: 0.8,
      },
      core: {
        engine: "svg",
        enableLazyLoading: true,
        useWorkers: true,
      },
      player: playerSettings
    });

    // 主题资源
    const themeColors = this.darkMode
      ? {
          staffLineColor: new model.Color(221, 221, 221),
          barSeparatorColor: new model.Color(221, 221, 221),
          barNumberColor: new model.Color(100, 108, 255),
          mainGlyphColor: new model.Color(238, 238, 238),
          secondaryGlyphColor: new model.Color(232, 232, 232),
          scoreInfoColor: new model.Color(248, 248, 248),
        }
      : {
          staffLineColor: new model.Color(34, 34, 34),
          barSeparatorColor: new model.Color(34, 34, 34),
          barNumberColor: new model.Color(100, 108, 255),
          mainGlyphColor: new model.Color(17, 17, 17),
          secondaryGlyphColor: new model.Color(24, 24, 24),
          scoreInfoColor: new model.Color(8, 8, 8),
        };
    
    // 设置字体
    const themeFonts = {
      titleFont: new model.Font("Arial", 24, model.FontStyle.Bold),
      subTitleFont: new model.Font("Arial", 14, model.FontStyle.Italic),
      wordsFont: new model.Font("Arial", 12, model.FontStyle.Plain),
      copyrightFont: new model.Font("Arial", 11, model.FontStyle.Plain),
      chordFont: new model.Font("Arial", 12, model.FontStyle.Plain),
      tablatureFont: new model.Font("Arial", 13, model.FontStyle.Plain),
      graceFont: new model.Font("Arial", 11, model.FontStyle.Plain),
      fretboardNumberFont: new model.Font("Arial", 11, model.FontStyle.Plain),
      fingeringFont: new model.Font("Arial", 10, model.FontStyle.Plain),
      effectFont: new model.Font("Arial", 12, model.FontStyle.Italic),
    };
    
    // 单独设置资源对象的属性，而不是替换整个对象
    Object.assign(this.alphaTabSettings.display.resources, themeColors, themeFonts);

    // 2. Setup renderer
    const renderer = new alphaTab.rendering.ScoreRenderer(this.alphaTabSettings);
    renderer.width = this.renderWidth;

    // 3. Listen to Events
    let svgChunks: { svg: string; width: number; height: number }[] = [];
    renderer.preRender.on((isResize) => {
      svgChunks = [];
    });
    renderer.partialLayoutFinished.on((r) => {
      renderer.renderResult(r.id);
    });
    renderer.partialRenderFinished.on((r) => {
      svgChunks.push({
        svg: r.renderResult as string, // svg string
        width: r.width,
        height: r.height,
      });
    });

    // 4. Virtual Render
    renderer.renderTracks(this.renderTracks);

    return svgChunks.map((c) => c.svg).join("\n");
  }

  renderTab() {
    const content = this.parseTabContent();

    // clean content
    this.contentEl.empty();
    const div = this.contentEl.createDiv("at-container-svgs");
    // insert svg to content
    div.insertAdjacentHTML("afterbegin", content);
  }

  /**
   * loaded file to render gtp
   * 文件加载完成 callback 自动调用，加载 gtp 读取 score，默认渲染 score 中第一个轨道
   * @param file
   */
  async onLoadFile(file: TFile) {
    // 0.loading
    this.contentEl.createEl("div", {
      text: "Loading TAB...",
      cls: "at at-container-loading",
    });

    // 1.load gtp
    const buffer = await this.app.vault.readBinary(file);
    const gtpUint8Array = new Uint8Array(buffer);
    this.score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
      gtpUint8Array,
      this.alphaTabSettings
    );
    // 2.set tracks and render fisrt track default
    this.renderTracks = [this.score.tracks[0]];
    this.tracksModal.setTracks(this.score.tracks);
    this.tracksModal.setRenderTracks([this.score.tracks[0]]);

    // 3.render tab, delay 0ms for get this.contentEl.clientWidth
    setTimeout(async () => {
      this.renderTab();
    }, 0);
  }

  onUnloadFile(file: TFile): Promise<void> {
    this.contentEl.empty();
    return super.onUnloadFile(file);
  }

  onResize(): void {
    super.onResize();
    const resizeWidth = this.contentEl.clientWidth;
    if (resizeWidth && resizeWidth !== this.renderWidth) {
      this.renderTab();
    }
  }

  downloadMidi = () => {
    const midiFile = new alphaTab.midi.MidiFile();
    const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(
      midiFile,
      true /* For SMF1.0 export */
    );
    const generator = new alphaTab.midi.MidiFileGenerator(
      this.score,
      this.alphaTabSettings,
      handler
    );

    // start generation
    generator.generate();
    // use midi file
    const fileName = `${this.getDisplayText()}.mid`;
    const blob = new Blob([midiFile.toBinary()], { type: "audio/midi" });
    saveToFile(fileName, blob);
  };

  // playMidi = async () => {
  //   const soundFontResponse = await fetch(
  //     "https://barba828.github.io/buitar-editor/soundfont/sonivox.sf2"
  //   );
  //   const midiFile = new alphaTab.midi.MidiFile();
  //   const soundFont = new Uint8Array(await soundFontResponse.arrayBuffer());

  //   // Setup player
  //   const player = new alphaTab.synth.AlphaSynth(
  //     new alphaTab.synth.AlphaSynthAudioWorkletOutput(this.alphaTabSettings),
  //     99999999
  //   );

  //   // const player = new alphaTab.synth.AlphaSynthWebWorkerApi(
  //   // new  alphaTab.synth.AlphaSynthAudioWorkletOutput(this.alphaTabSettings),
  //   // this.alphaTabSettings
  //   // );

  //   // const player = new alphaTab.synth.AlphaSynthWebWorkerApi(
  //   // new alphaTab.synth.AlphaSynthScriptProcessorOutput(),
  //   // this.alphaTabSettings
  //   // );

  //   player.loadSoundFont(soundFont, false);
  //   player.loadMidiFile(midiFile);
  //   player.play();
  // };

  onChangeTracks = (selectTracks: AlphaTabApi["tracks"]) => {
    this.renderTracks = selectTracks;
    this.renderGTP();
  };
}

// 辅助函数
export function saveToFile(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
