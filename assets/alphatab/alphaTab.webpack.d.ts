import type * as webpackTypes from 'webpack';

export declare class AlphaTabWebPackPlugin {
    _webPackWithAlphaTab: webPackWithAlphaTab;
    options: AlphaTabWebPackPluginOptions;
    constructor(options?: AlphaTabWebPackPluginOptions);
    apply(compiler: webpackTypes.Compiler): void;
    configureSoundFont(compiler: webpackTypes.Compiler): void;
    configure(compiler: webpackTypes.Compiler): void;
    configureAssetCopy(webPackWithAlphaTab: webPackWithAlphaTab, pluginName: string, compiler: webpackTypes.Compiler, compilation: webpackTypes.Compilation): void;
}

/**@target web */
declare interface AlphaTabWebPackPluginOptions {
    /**
     * The location where alphaTab can be found.
     * (default: node_modules/@coderline/alphatab/dist)
     */
    alphaTabSourceDir?: string;
    /**
     * The location where assets of alphaTab should be placed.
     * Set it to false to disable the copying of assets like fonts.
     * (default: compiler.options.output.path)
     */
    assetOutputDir?: string | false;
    /**
     * Whether alphaTab should configure the audio worklet support in WebPack.
     * This might break support for audio playback unless audio worklet support is added
     * through other means to WebPack.
     * (default: true)
     */
    audioWorklets?: boolean;
    /**
     * Whether alphaTab should configure the web worklet support in WebPack.
     * This might break support for audio playback and background unless audio worklet support is added
     * through other means to WebPack.
     * (default: true)
     */
    webWorkers?: boolean;
}

declare type NormalModuleFactory = webpackTypes.Compilation['params']['normalModuleFactory'];

declare type webPackWithAlphaTab = {
    webpack: webpackTypes.Compiler['webpack'];
    alphaTab: {
        registerWebWorkerRuntimeModule(pluginName: string, compilation: webpackTypes.Compilation): void;
        WebWorkerRuntimeModuleKey: string;
        createWebWorkerDependency(request: string, range: [number, number], publicPath: string | undefined): webpackTypes.dependencies.ModuleDependency;
        registerWebWorkerDependency(compilation: webpackTypes.Compilation, normalModuleFactory: NormalModuleFactory): void;
        registerWorkletRuntimeModule(pluginName: string, compilation: webpackTypes.Compilation): void;
        RuntimeGlobalWorkletGetStartupChunks: string;
        createWorkletDependency(request: string, range: [number, number], publicPath: string | undefined): webpackTypes.dependencies.ModuleDependency;
        registerWorkletDependency(compilation: webpackTypes.Compilation, normalModuleFactory: NormalModuleFactory): void;
    };
};

export { }
