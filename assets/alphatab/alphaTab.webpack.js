/*!
 * alphaTab v1.5.0 (, build 18)
 *
 * Copyright © 2025, Daniel Kuschny and Contributors, All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Integrated Libraries:
 *
 * Library: TinySoundFont
 * License: MIT
 * Copyright: Copyright (C) 2017, 2018 Bernhard Schelling
 * URL: https://github.com/schellingb/TinySoundFont
 * Purpose: SoundFont loading and Audio Synthesis
 *
 * Library: SFZero
 * License: MIT
 * Copyright: Copyright (C) 2012 Steve Folta ()
 * URL: https://github.com/stevefolta/SFZero
 * Purpose: TinySoundFont is based on SFZEro
 *
 * Library: Haxe Standard Library
 * License: MIT
 * Copyright: Copyright (C)2005-2025 Haxe Foundation
 * URL: https://github.com/HaxeFoundation/haxe/tree/development/std
 * Purpose: XML Parser & Zip Inflate Algorithm
 *
 * Library: SharpZipLib
 * License: MIT
 * Copyright: Copyright © 2000-2018 SharpZipLib Contributors
 * URL: https://github.com/icsharpcode/SharpZipLib
 * Purpose: Zip Deflate Algorithm for writing compressed Zips
 *
 * Library: NVorbis
 * License: MIT
 * Copyright: Copyright (c) 2020 Andrew Ward
 * URL: https://github.com/NVorbis/NVorbis
 * Purpose: Vorbis Stream Decoding
 *
 * Library: libvorbis
 * License: BSD-3-Clause
 * Copyright: Copyright (c) 2002-2020 Xiph.org Foundation
 * URL: https://github.com/xiph/vorbis
 * Purpose: NVorbis adopted some code from libvorbis.
 *
 * @preserve
 * @license
 */

'use strict';

if(typeof Symbol.dispose==='undefined'){Symbol.dispose = Symbol('Symbol.dispose')}

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

function _interopNamespaceDefault(e) {
    const n = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } });
    if (e) {
        for (const k in e) {
            if (k !== 'default') {
                const d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: () => e[k]
                });
            }
        }
    }
    n.default = e;
    return Object.freeze(n);
}

const fs__namespace = /*#__PURE__*/_interopNamespaceDefault(fs);
const path__namespace = /*#__PURE__*/_interopNamespaceDefault(path);
const url__namespace = /*#__PURE__*/_interopNamespaceDefault(url);

const JAVASCRIPT_MODULE_TYPE_AUTO = 'javascript/auto';
const JAVASCRIPT_MODULE_TYPE_ESM = 'javascript/esm';
function makeDependencySerializable(webPackWithAlphaTab, dependency, key) {
    webPackWithAlphaTab.webpack.util.serialization.register(dependency, key, null, {
        serialize(obj, context) {
            obj.serialize(context);
        },
        deserialize(context) {
            if (typeof dependency.deserialize === 'function') {
                return dependency.deserialize(context);
            }
            const obj = new dependency();
            obj.deserialize(context);
            return obj;
        }
    });
}
function tapJavaScript(normalModuleFactory, pluginName, parserPlugin) {
    normalModuleFactory.hooks.parser.for(JAVASCRIPT_MODULE_TYPE_AUTO).tap(pluginName, parserPlugin);
    normalModuleFactory.hooks.parser.for(JAVASCRIPT_MODULE_TYPE_ESM).tap(pluginName, parserPlugin);
}
function parseModuleUrl(parser, expr) {
    if (expr.type !== 'NewExpression' || expr.arguments.length !== 2) {
        return;
    }
    const newExpr = expr;
    const [arg1, arg2] = newExpr.arguments;
    const callee = parser.evaluateExpression(newExpr.callee);
    if (!callee.isIdentifier() || !callee.identifier.includes('alphaTabUrl')) {
        return;
    }
    const arg1Value = parser.evaluateExpression(arg1);
    return [arg1Value, [arg1.range[0], arg2.range[1]]];
}
const ALPHATAB_WORKER_RUNTIME_PREFIX = 'atworker_';
function getWorkerRuntime(parser, compilation, cachedContextify, workerIndexMap) {
    const i = workerIndexMap.get(parser.state) || 0;
    workerIndexMap.set(parser.state, i + 1);
    const name = `${cachedContextify(parser.state.module.identifier())}|${i}`;
    const hash = compilation.compiler.webpack.util.createHash(compilation.outputOptions.hashFunction);
    hash.update(name);
    const digest = hash.digest(compilation.outputOptions.hashDigest);
    const runtime = digest.slice(0, compilation.outputOptions.hashDigestLength);
    return ALPHATAB_WORKER_RUNTIME_PREFIX + runtime;
}
function isWorkerRuntime(runtime) {
    if (typeof runtime !== 'string') {
        return false;
    }
    return runtime.startsWith(ALPHATAB_WORKER_RUNTIME_PREFIX);
}

/**@target web */
function injectWorkerRuntimeModule(webPackWithAlphaTab) {
    class AlphaTabWorkerRuntimeModule extends webPackWithAlphaTab.webpack.RuntimeModule {
        constructor() {
            super('alphaTab audio worker chunk loading', webPackWithAlphaTab.webpack.RuntimeModule.STAGE_BASIC);
        }
        generate() {
            const compilation = this.compilation;
            const runtimeTemplate = compilation.runtimeTemplate;
            const globalObject = runtimeTemplate.globalObject;
            const chunkLoadingGlobalExpr = `${globalObject}[${JSON.stringify(compilation.outputOptions.chunkLoadingGlobal)}]`;
            const initialChunkIds = new Set(this.chunk.ids);
            for (const c of this.chunk.getAllInitialChunks()) {
                if (webPackWithAlphaTab.webpack.javascript.JavascriptModulesPlugin.chunkHasJs(c, this.chunkGraph)) {
                    continue;
                }
                for (const id of c.ids) {
                    initialChunkIds.add(id);
                }
            }
            return webPackWithAlphaTab.webpack.Template.asString([
                `if ( ! ('AudioWorkletGlobalScope' in ${globalObject}) ) { return; }`,
                'const installedChunks = {',
                webPackWithAlphaTab.webpack.Template.indent(Array.from(initialChunkIds, id => `${JSON.stringify(id)}: 1`).join(',\n')),
                '};',
                '// importScripts chunk loading',
                `const installChunk = ${runtimeTemplate.basicFunction('data', [
                    runtimeTemplate.destructureArray(['chunkIds', 'moreModules', 'runtime'], 'data'),
                    'for(const moduleId in moreModules) {',
                    webPackWithAlphaTab.webpack.Template.indent([
                        `if(${webPackWithAlphaTab.webpack.RuntimeGlobals.hasOwnProperty}(moreModules, moduleId)) {`,
                        webPackWithAlphaTab.webpack.Template.indent(`${webPackWithAlphaTab.webpack.RuntimeGlobals.moduleFactories}[moduleId] = moreModules[moduleId];`),
                        '}'
                    ]),
                    '}',
                    `if(runtime) runtime(${webPackWithAlphaTab.webpack.RuntimeGlobals.require});`,
                    'while(chunkIds.length)',
                    webPackWithAlphaTab.webpack.Template.indent('installedChunks[chunkIds.pop()] = 1;'),
                    'parentChunkLoadingFunction(data);'
                ])};`,
                `const chunkLoadingGlobal = ${chunkLoadingGlobalExpr} = ${chunkLoadingGlobalExpr} || [];`,
                'const parentChunkLoadingFunction = chunkLoadingGlobal.push.bind(chunkLoadingGlobal);',
                'chunkLoadingGlobal.forEach(installChunk);',
                'chunkLoadingGlobal.push = installChunk;'
            ]);
        }
    }
    AlphaTabWorkerRuntimeModule.Key = 'AlphaTabWorkerRuntime';
    webPackWithAlphaTab.alphaTab.registerWebWorkerRuntimeModule = (pluginName, compilation) => {
        compilation.hooks.runtimeRequirementInTree
            .for(AlphaTabWorkerRuntimeModule.Key)
            .tap(pluginName, (chunk) => {
            compilation.addRuntimeModule(chunk, new AlphaTabWorkerRuntimeModule());
        });
        compilation.hooks.additionalChunkRuntimeRequirements.tap(pluginName, (chunk, runtimeRequirements) => {
            if (isWorkerRuntime(chunk.runtime)) {
                runtimeRequirements.add(webPackWithAlphaTab.webpack.RuntimeGlobals.moduleFactories);
                runtimeRequirements.add(webPackWithAlphaTab.alphaTab.WebWorkerRuntimeModuleKey);
            }
        });
    };
    webPackWithAlphaTab.alphaTab.WebWorkerRuntimeModuleKey = AlphaTabWorkerRuntimeModule.Key;
}

/**@target web */
const AlphaTabWorkletSpecifierTag = Symbol('alphatab worklet specifier tag');
const workletIndexMap = new WeakMap();
/**
 * Configures the Audio Worklet aspects within webpack.
 * The counterpart which this plugin detects sits in alphaTab.main.ts
 * @param pluginName
 * @param options
 * @param compiler
 * @param compilation
 * @param normalModuleFactory
 * @param cachedContextify
 * @returns
 */
function configureAudioWorklet(webPackWithAlphaTab, pluginName, options, compiler, compilation, normalModuleFactory, cachedContextify) {
    if (options.audioWorklets === false) {
        return;
    }
    webPackWithAlphaTab.alphaTab.registerWorkletDependency(compilation, normalModuleFactory);
    const handleAlphaTabWorklet = (parser, expr) => {
        const [arg1] = expr.arguments;
        const parsedUrl = parseModuleUrl(parser, arg1);
        if (!parsedUrl) {
            return;
        }
        const [url] = parsedUrl;
        if (!url.isString()) {
            return;
        }
        const runtime = getWorkerRuntime(parser, compilation, cachedContextify, workletIndexMap);
        const block = new webPackWithAlphaTab.webpack.AsyncDependenciesBlock({
            entryOptions: {
                chunkLoading: false,
                wasmLoading: false,
                runtime: runtime
            }
        });
        block.loc = expr.loc;
        const workletBootstrap = webPackWithAlphaTab.alphaTab.createWorkletDependency(url.string, [expr.range[0], expr.range[1]], compiler.options.output.workerPublicPath);
        workletBootstrap.loc = expr.loc;
        block.addDependency(workletBootstrap);
        parser.state.module.addBlock(block);
        return true;
    };
    const parserPlugin = (parser) => {
        const pattern = 'alphaTabWorklet';
        const itemMembers = 'addModule';
        parser.hooks.preDeclarator.tap(pluginName, (decl) => {
            if (decl.id.type === 'Identifier' && decl.id.name === pattern) {
                parser.tagVariable(decl.id.name, AlphaTabWorkletSpecifierTag);
                return true;
            }
            return;
        });
        parser.hooks.pattern.for(pattern).tap(pluginName, (pattern) => {
            parser.tagVariable(pattern.name, AlphaTabWorkletSpecifierTag);
            return true;
        });
        parser.hooks.callMemberChain
            .for(AlphaTabWorkletSpecifierTag)
            .tap(pluginName, (expression, members) => {
            if (itemMembers !== members.join('.')) {
                return;
            }
            return handleAlphaTabWorklet(parser, expression);
        });
    };
    tapJavaScript(normalModuleFactory, pluginName, parserPlugin);
}

/**@target web */
const workerIndexMap = new WeakMap();
/**
 * Configures the WebWorker aspects within webpack.
 * The counterpart which this plugin detects sits in alphaTab.main.ts
 * @param pluginName
 * @param options
 * @param compiler
 * @param compilation
 * @param normalModuleFactory
 * @param cachedContextify
 * @returns
 */
function configureWebWorker(webPackWithAlphaTab, pluginName, options, compiler, compilation, normalModuleFactory, cachedContextify) {
    if (options.audioWorklets === false) {
        return;
    }
    webPackWithAlphaTab.alphaTab.registerWebWorkerDependency(compilation, normalModuleFactory);
    new webPackWithAlphaTab.webpack.javascript.EnableChunkLoadingPlugin('import-scripts').apply(compiler);
    const handleAlphaTabWorker = (parser, expr) => {
        const [arg1, arg2] = expr.arguments;
        const parsedUrl = parseModuleUrl(parser, arg1);
        if (!parsedUrl) {
            return;
        }
        const [url, range] = parsedUrl;
        if (!url.isString()) {
            return;
        }
        const runtime = getWorkerRuntime(parser, compilation, cachedContextify, workerIndexMap);
        const block = new webPackWithAlphaTab.webpack.AsyncDependenciesBlock({
            entryOptions: {
                chunkLoading: 'import-scripts',
                wasmLoading: false,
                runtime: runtime
            }
        });
        block.loc = expr.loc;
        const workletBootstrap = webPackWithAlphaTab.alphaTab.createWebWorkerDependency(url.string, range, compiler.options.output.workerPublicPath);
        workletBootstrap.loc = expr.loc;
        block.addDependency(workletBootstrap);
        parser.state.module.addBlock(block);
        const dep1 = new webPackWithAlphaTab.webpack.dependencies.ConstDependency(`{ type: ${compilation.options.output.module ? '"module"' : 'undefined'} }`, arg2.range);
        dep1.loc = expr.loc;
        parser.state.module.addPresentationalDependency(dep1);
        parser.walkExpression(expr.callee);
        parser.walkExpression(arg1.callee);
        return true;
    };
    const parserPlugin = (parser) => {
        parser.hooks.new
            .for('alphaTab.Environment.alphaTabWorker')
            .tap(pluginName, (expr) => handleAlphaTabWorker(parser, expr));
    };
    tapJavaScript(normalModuleFactory, pluginName, parserPlugin);
}

/**@target web */
function injectWebWorkerDependency(webPackWithAlphaTab) {
    class AlphaTabWebWorkerDependency extends webPackWithAlphaTab.webpack.dependencies.ModuleDependency {
        constructor(request, range, publicPath) {
            super(request);
            this.range = range;
            this.publicPath = publicPath;
        }
        getReferencedExports() {
            return webPackWithAlphaTab.webpack.Dependency.NO_EXPORTS_REFERENCED;
        }
        get type() {
            return 'alphaTabWorker';
        }
        get category() {
            return 'worker';
        }
        updateHash(hash) {
            if (this._hashUpdate === undefined) {
                this._hashUpdate = JSON.stringify(this.publicPath);
            }
            hash.update(this._hashUpdate);
        }
        serialize(context) {
            const { write } = context;
            write(this.publicPath);
            super.serialize(context);
        }
        deserialize(context) {
            const { read } = context;
            this.publicPath = read();
            super.deserialize(context);
        }
    }
    AlphaTabWebWorkerDependency.Template = class WorkerDependencyTemplate extends (webPackWithAlphaTab.webpack.dependencies.ModuleDependency.Template) {
        apply(dependency, source, templateContext) {
            const { chunkGraph, moduleGraph, runtimeRequirements } = templateContext;
            const dep = dependency;
            const block = moduleGraph.getParentBlock(dependency);
            const entrypoint = chunkGraph.getBlockChunkGroup(block);
            const chunk = entrypoint.getEntrypointChunk();
            // We use the workerPublicPath option if provided, else we fallback to the RuntimeGlobal publicPath
            const workerImportBaseUrl = dep.publicPath
                ? `"${dep.publicPath}"`
                : webPackWithAlphaTab.webpack.RuntimeGlobals.publicPath;
            runtimeRequirements.add(webPackWithAlphaTab.webpack.RuntimeGlobals.publicPath);
            runtimeRequirements.add(webPackWithAlphaTab.webpack.RuntimeGlobals.baseURI);
            runtimeRequirements.add(webPackWithAlphaTab.webpack.RuntimeGlobals.getChunkScriptFilename);
            source.replace(dep.range[0], dep.range[1] - 1, `/* worker import */ ${workerImportBaseUrl} + ${webPackWithAlphaTab.webpack.RuntimeGlobals.getChunkScriptFilename}(${JSON.stringify(chunk.id)}), ${webPackWithAlphaTab.webpack.RuntimeGlobals.baseURI}`);
        }
    };
    makeDependencySerializable(webPackWithAlphaTab, AlphaTabWebWorkerDependency, 'AlphaTabWebWorkerDependency');
    webPackWithAlphaTab.alphaTab.createWebWorkerDependency = (request, range, publicPath) => new AlphaTabWebWorkerDependency(request, range, publicPath);
    webPackWithAlphaTab.alphaTab.registerWebWorkerDependency = (compilation, normalModuleFactory) => {
        compilation.dependencyFactories.set(AlphaTabWebWorkerDependency, normalModuleFactory);
        compilation.dependencyTemplates.set(AlphaTabWebWorkerDependency, new AlphaTabWebWorkerDependency.Template());
    };
}

/**@target web */
function injectWorkletRuntimeModule(webPackWithAlphaTab) {
    class AlphaTabWorkletStartRuntimeModule extends webPackWithAlphaTab.webpack.RuntimeModule {
        constructor() {
            super('alphaTab audio worklet chunk lookup', webPackWithAlphaTab.webpack.RuntimeModule.STAGE_BASIC);
        }
        generate() {
            const compilation = this.compilation;
            const workletChunkLookup = new Map();
            const allChunks = compilation.chunks;
            for (const chunk of allChunks) {
                const isWorkletEntry = isWorkerRuntime(chunk.runtime);
                if (isWorkletEntry) {
                    const workletChunks = Array.from(chunk.getAllReferencedChunks()).map(c => {
                        // force content chunk to be created
                        compilation.hooks.contentHash.call(c);
                        return compilation.getPath(webPackWithAlphaTab.webpack.javascript.JavascriptModulesPlugin.getChunkFilenameTemplate(c, compilation.outputOptions), {
                            chunk: c,
                            contentHashType: 'javascript'
                        });
                    });
                    workletChunkLookup.set(String(chunk.id), workletChunks);
                }
            }
            return webPackWithAlphaTab.webpack.Template.asString([
                `${AlphaTabWorkletStartRuntimeModule.RuntimeGlobalWorkletGetStartupChunks} = (() => {`,
                webPackWithAlphaTab.webpack.Template.indent([
                    'const lookup = new Map(',
                    webPackWithAlphaTab.webpack.Template.indent(JSON.stringify(Array.from(workletChunkLookup.entries()))),
                    ');',
                    'return (chunkId) => lookup.get(String(chunkId)) ?? [];'
                ]),
                '})();'
            ]);
        }
    }
    AlphaTabWorkletStartRuntimeModule.RuntimeGlobalWorkletGetStartupChunks = '__webpack_require__.wsc';
    webPackWithAlphaTab.alphaTab.RuntimeGlobalWorkletGetStartupChunks =
        AlphaTabWorkletStartRuntimeModule.RuntimeGlobalWorkletGetStartupChunks;
    webPackWithAlphaTab.alphaTab.registerWorkletRuntimeModule = (pluginName, compilation) => {
        compilation.hooks.runtimeRequirementInTree
            .for(AlphaTabWorkletStartRuntimeModule.RuntimeGlobalWorkletGetStartupChunks)
            .tap(pluginName, (chunk) => {
            compilation.addRuntimeModule(chunk, new AlphaTabWorkletStartRuntimeModule());
        });
    };
}

/**@target web */
function injectWorkletDependency(webPackWithAlphaTab) {
    /**
     * This module dependency injects the relevant code into a worklet bootstrap script
     * to install chunks which have been added to the worklet via addModule before the bootstrap script starts.
     */
    class AlphaTabWorkletDependency extends webPackWithAlphaTab.webpack.dependencies.ModuleDependency {
        constructor(url, range, publicPath) {
            super(url);
            this.range = range;
            this.publicPath = publicPath;
        }
        get type() {
            return 'alphaTabWorklet';
        }
        get category() {
            return 'worker';
        }
        updateHash(hash) {
            if (this._hashUpdate === undefined) {
                this._hashUpdate = JSON.stringify(this.publicPath);
            }
            hash.update(this._hashUpdate);
        }
        serialize(context) {
            const { write } = context;
            write(this.publicPath);
            super.serialize(context);
        }
        deserialize(context) {
            const { read } = context;
            this.publicPath = read();
            super.deserialize(context);
        }
    }
    AlphaTabWorkletDependency.Template = class AlphaTabWorkletDependencyTemplate extends (webPackWithAlphaTab.webpack.dependencies.ModuleDependency.Template) {
        apply(dependency, source, templateContext) {
            const { chunkGraph, moduleGraph, runtimeRequirements } = templateContext;
            const dep = dependency;
            const block = moduleGraph.getParentBlock(dependency);
            const entrypoint = chunkGraph.getBlockChunkGroup(block);
            const workletImportBaseUrl = dep.publicPath
                ? JSON.stringify(dep.publicPath)
                : webPackWithAlphaTab.webpack.RuntimeGlobals.publicPath;
            const chunk = entrypoint.getEntrypointChunk();
            // worklet global scope has no 'self', need to inject it for compatibility with chunks
            // some plugins like the auto public path need to right location. we pass this on from the main runtime
            // some plugins rely on importScripts to be defined.
            const workletInlineBootstrap = `
                globalThis.self = globalThis.self || globalThis;
                globalThis.location = \${JSON.stringify(${webPackWithAlphaTab.webpack.RuntimeGlobals.baseURI})};
                globalThis.importScripts = (url) => { throw new Error("importScripts not available, dynamic loading of chunks not supported in this context", url) };
            `;
            chunkGraph.addChunkRuntimeRequirements(chunk, new Set([
                webPackWithAlphaTab.webpack.RuntimeGlobals.moduleFactories,
                webPackWithAlphaTab.alphaTab.WebWorkerRuntimeModuleKey
            ]));
            runtimeRequirements.add(webPackWithAlphaTab.alphaTab.RuntimeGlobalWorkletGetStartupChunks);
            source.replace(dep.range[0], dep.range[1] - 1, webPackWithAlphaTab.webpack.Template.asString([
                '(/* worklet bootstrap */ async function(__webpack_worklet__) {',
                webPackWithAlphaTab.webpack.Template.indent([
                    `await __webpack_worklet__.addModule(URL.createObjectURL(new Blob([\`${workletInlineBootstrap}\`], { type: "application/javascript; charset=utf-8" })));`,
                    `for (const fileName of ${webPackWithAlphaTab.alphaTab.RuntimeGlobalWorkletGetStartupChunks}(${JSON.stringify(chunk.id)})) {`,
                    webPackWithAlphaTab.webpack.Template.indent([
                        `await __webpack_worklet__.addModule(new URL(${workletImportBaseUrl} + fileName, ${webPackWithAlphaTab.webpack.RuntimeGlobals.baseURI}));`
                    ]),
                    '}'
                ]),
                '})(alphaTabWorklet)'
            ]));
        }
    };
    makeDependencySerializable(webPackWithAlphaTab, AlphaTabWorkletDependency, 'AlphaTabWorkletDependency');
    webPackWithAlphaTab.alphaTab.registerWorkletDependency = (compilation, normalModuleFactory) => {
        compilation.dependencyFactories.set(AlphaTabWorkletDependency, normalModuleFactory);
        compilation.dependencyTemplates.set(AlphaTabWorkletDependency, new AlphaTabWorkletDependency.Template());
    };
    webPackWithAlphaTab.alphaTab.createWorkletDependency = (request, range, publicPath) => new AlphaTabWorkletDependency(request, range, publicPath);
}

/**@target web */
const WINDOWS_ABS_PATH_REGEXP = /^[a-zA-Z]:[\\/]/;
const WINDOWS_PATH_SEPARATOR_REGEXP = /\\/g;
const relativePathToRequest = (relativePath) => {
    if (relativePath === '') {
        return '@src/webpack/.';
    }
    if (relativePath === '..') {
        return '../.';
    }
    if (relativePath.startsWith('../')) {
        return relativePath;
    }
    return `./${relativePath}`;
};
const absoluteToRequest = (context, maybeAbsolutePath) => {
    if (maybeAbsolutePath[0] === '/') {
        if (maybeAbsolutePath.length > 1 && maybeAbsolutePath[maybeAbsolutePath.length - 1] === '/') {
            // this 'path' is actually a regexp generated by dynamic requires.
            // Don't treat it as an absolute path.
            return maybeAbsolutePath;
        }
        const querySplitPos = maybeAbsolutePath.indexOf('?');
        let resource = querySplitPos === -1 ? maybeAbsolutePath : maybeAbsolutePath.slice(0, querySplitPos);
        resource = relativePathToRequest(path__namespace.posix.relative(context, resource));
        return querySplitPos === -1 ? resource : resource + maybeAbsolutePath.slice(querySplitPos);
    }
    if (WINDOWS_ABS_PATH_REGEXP.test(maybeAbsolutePath)) {
        const querySplitPos = maybeAbsolutePath.indexOf('?');
        let resource = querySplitPos === -1 ? maybeAbsolutePath : maybeAbsolutePath.slice(0, querySplitPos);
        resource = path__namespace.win32.relative(context, resource);
        if (!WINDOWS_ABS_PATH_REGEXP.test(resource)) {
            resource = relativePathToRequest(resource.replace(WINDOWS_PATH_SEPARATOR_REGEXP, '/'));
        }
        return querySplitPos === -1 ? resource : resource + maybeAbsolutePath.slice(querySplitPos);
    }
    // not an absolute path
    return maybeAbsolutePath;
};
const _contextify = (context, request) => {
    return request
        .split('!')
        .map(r => absoluteToRequest(context, r))
        .join('!');
};
const makeCacheableWithContext = (fn) => {
    const cache = new WeakMap();
    const cachedFn = (context, identifier, associatedObjectForCache) => {
        if (!associatedObjectForCache) {
            return fn(context, identifier);
        }
        let innerCache = cache.get(associatedObjectForCache);
        if (innerCache === undefined) {
            innerCache = new Map();
            cache.set(associatedObjectForCache, innerCache);
        }
        let cachedResult;
        let innerSubCache = innerCache.get(context);
        if (innerSubCache === undefined) {
            innerSubCache = new Map();
            innerCache.set(context, innerSubCache);
        }
        else {
            cachedResult = innerSubCache.get(identifier);
        }
        if (cachedResult !== undefined) {
            return cachedResult;
        }
        const result = fn(context, identifier);
        innerSubCache.set(identifier, result);
        return result;
    };
    cachedFn.bindContextCache = (context, associatedObjectForCache) => {
        let innerSubCache;
        if (associatedObjectForCache) {
            let innerCache = cache.get(associatedObjectForCache);
            if (innerCache === undefined) {
                innerCache = new Map();
                cache.set(associatedObjectForCache, innerCache);
            }
            innerSubCache = innerCache.get(context);
            if (innerSubCache === undefined) {
                innerSubCache = new Map();
                innerCache.set(context, innerSubCache);
            }
        }
        else {
            innerSubCache = new Map();
        }
        const boundFn = (identifier) => {
            const cachedResult = innerSubCache.get(identifier);
            if (cachedResult !== undefined) {
                return cachedResult;
            }
            const result = fn(context, identifier);
            innerSubCache.set(identifier, result);
            return result;
        };
        return boundFn;
    };
    return cachedFn;
};
const contextify = makeCacheableWithContext(_contextify);
class AlphaTabWebPackPlugin {
    constructor(options) {
        this.options = options ?? {};
    }
    apply(compiler) {
        // here we create all plugin related class implementations using
        // the webpack instance provided to this plugin (not as global import)
        // after that we use the helper and factory functions we add to webpack
        const webPackWithAlphaTab = {
            webpack: compiler.webpack,
            alphaTab: {}
        };
        if ('alphaTab' in compiler.webpack.util.serialization.register) {
            // prevent multi registration
            webPackWithAlphaTab.alphaTab = compiler.webpack.util.serialization.register.alphaTab;
        }
        else {
            compiler.webpack.util.serialization.register.alphaTab = webPackWithAlphaTab.alphaTab;
            injectWebWorkerDependency(webPackWithAlphaTab);
            injectWorkerRuntimeModule(webPackWithAlphaTab);
            injectWorkletDependency(webPackWithAlphaTab);
            injectWorkletRuntimeModule(webPackWithAlphaTab);
        }
        this._webPackWithAlphaTab = webPackWithAlphaTab;
        this.configureSoundFont(compiler);
        this.configure(compiler);
    }
    configureSoundFont(compiler) {
        if (this.options.assetOutputDir === false) {
            return;
        }
        // register soundfont as resource
        compiler.options.module.rules.push({
            test: /\.sf2/,
            type: 'asset/resource'
        });
        compiler.options.module.rules.push({
            test: /\.sf3/,
            type: 'asset/resource'
        });
    }
    configure(compiler) {
        const pluginName = this.constructor.name;
        const cachedContextify = contextify.bindContextCache(compiler.context, compiler.root);
        compiler.hooks.thisCompilation.tap(pluginName, (compilation, { normalModuleFactory }) => {
            this._webPackWithAlphaTab.alphaTab.registerWebWorkerRuntimeModule(pluginName, compilation);
            this._webPackWithAlphaTab.alphaTab.registerWorkletRuntimeModule(pluginName, compilation);
            configureAudioWorklet(this._webPackWithAlphaTab, pluginName, this.options, compiler, compilation, normalModuleFactory, cachedContextify);
            configureWebWorker(this._webPackWithAlphaTab, pluginName, this.options, compiler, compilation, normalModuleFactory, cachedContextify);
            this.configureAssetCopy(this._webPackWithAlphaTab, pluginName, compiler, compilation);
        });
    }
    configureAssetCopy(webPackWithAlphaTab, pluginName, compiler, compilation) {
        if (this.options.assetOutputDir === false) {
            return;
        }
        const options = this.options;
        compilation.hooks.processAssets.tapAsync({
            name: pluginName,
            stage: this._webPackWithAlphaTab.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
        }, async (_, callback) => {
            let alphaTabSourceDir = options.alphaTabSourceDir;
            if (!alphaTabSourceDir) {
                try {
                    const isEsm = typeof {} === 'string';
                    if (isEsm) {
                        alphaTabSourceDir = url__namespace.fileURLToPath({}('@coderline/alphatab'));
                    }
                    else {
                        alphaTabSourceDir = require.resolve('@coderline/alphatab');
                    }
                    alphaTabSourceDir = path__namespace.resolve(alphaTabSourceDir, '..');
                }
                catch (e) {
                    alphaTabSourceDir = compilation.getPath('node_modules/@coderline/alphatab/dist/');
                }
            }
            let isValidAlphaTabSourceDir;
            if (alphaTabSourceDir) {
                try {
                    await fs__namespace.promises.access(path__namespace.join(alphaTabSourceDir, 'alphaTab.mjs'), fs__namespace.constants.F_OK);
                    isValidAlphaTabSourceDir = true;
                }
                catch (e) {
                    isValidAlphaTabSourceDir = false;
                }
            }
            else {
                isValidAlphaTabSourceDir = false;
            }
            if (!isValidAlphaTabSourceDir) {
                compilation.errors.push(new this._webPackWithAlphaTab.webpack.WebpackError('Could not find alphaTab, please ensure it is installed into node_modules or configure alphaTabSourceDir'));
                return;
            }
            const outputPath = (options.assetOutputDir ?? compiler.options.output.path);
            if (!outputPath) {
                compilation.errors.push(new this._webPackWithAlphaTab.webpack.WebpackError('Need output.path configured in application to store asset files.'));
                return;
            }
            async function copyFiles(subdir) {
                const fullDir = path__namespace.join(alphaTabSourceDir, subdir);
                compilation.contextDependencies.add(path__namespace.normalize(fullDir));
                const files = await fs__namespace.promises.readdir(fullDir, { withFileTypes: true });
                await fs__namespace.promises.mkdir(path__namespace.join(outputPath, subdir), { recursive: true });
                await Promise.all(files
                    .filter(f => f.isFile())
                    .map(async (file) => {
                    // node v20.12.0 has parentPath pointing to the path (not the file)
                    // see https://github.com/nodejs/node/pull/50976
                    const sourceFilename = path__namespace.join(file.parentPath ?? file.path, file.name);
                    await fs__namespace.promises.copyFile(sourceFilename, path__namespace.join(outputPath, subdir, file.name));
                    const assetFileName = `${subdir}/${file.name}`;
                    const existingAsset = compilation.getAsset(assetFileName);
                    const data = await fs__namespace.promises.readFile(sourceFilename);
                    const source = new webPackWithAlphaTab.webpack.sources.RawSource(data);
                    if (existingAsset) {
                        compilation.updateAsset(assetFileName, source, {
                            copied: true,
                            sourceFilename
                        });
                    }
                    else {
                        compilation.emitAsset(assetFileName, source, {
                            copied: true,
                            sourceFilename
                        });
                    }
                }));
            }
            await Promise.all([copyFiles('font'), copyFiles('soundfont')]);
            callback();
        });
    }
}

exports.AlphaTabWebPackPlugin = AlphaTabWebPackPlugin;
