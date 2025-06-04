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

if(typeof Symbol.dispose==='undefined'){Symbol.dispose = Symbol('Symbol.dispose')}

import * as path from 'node:path';
import path__default from 'node:path';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizePath, BuildEnvironment } from 'vite';
import * as url from 'node:url';

var sourcemapCodec_umd$1 = {exports: {}};

var sourcemapCodec_umd = sourcemapCodec_umd$1.exports;

var hasRequiredSourcemapCodec_umd;

function requireSourcemapCodec_umd () {
	if (hasRequiredSourcemapCodec_umd) return sourcemapCodec_umd$1.exports;
	hasRequiredSourcemapCodec_umd = 1;
	(function (module, exports) {
		(function (global, factory) {
		    factory(exports) ;
		})(sourcemapCodec_umd, (function (exports) {
		    const comma = ','.charCodeAt(0);
		    const semicolon = ';'.charCodeAt(0);
		    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
		    const intToChar = new Uint8Array(64); // 64 possible chars.
		    const charToInt = new Uint8Array(128); // z is 122 in ASCII
		    for (let i = 0; i < chars.length; i++) {
		        const c = chars.charCodeAt(i);
		        intToChar[i] = c;
		        charToInt[c] = i;
		    }
		    function decodeInteger(reader, relative) {
		        let value = 0;
		        let shift = 0;
		        let integer = 0;
		        do {
		            const c = reader.next();
		            integer = charToInt[c];
		            value |= (integer & 31) << shift;
		            shift += 5;
		        } while (integer & 32);
		        const shouldNegate = value & 1;
		        value >>>= 1;
		        if (shouldNegate) {
		            value = -2147483648 | -value;
		        }
		        return relative + value;
		    }
		    function encodeInteger(builder, num, relative) {
		        let delta = num - relative;
		        delta = delta < 0 ? (-delta << 1) | 1 : delta << 1;
		        do {
		            let clamped = delta & 0b011111;
		            delta >>>= 5;
		            if (delta > 0)
		                clamped |= 0b100000;
		            builder.write(intToChar[clamped]);
		        } while (delta > 0);
		        return num;
		    }
		    function hasMoreVlq(reader, max) {
		        if (reader.pos >= max)
		            return false;
		        return reader.peek() !== comma;
		    }

		    const bufLength = 1024 * 16;
		    // Provide a fallback for older environments.
		    const td = typeof TextDecoder !== 'undefined'
		        ? /* #__PURE__ */ new TextDecoder()
		        : typeof Buffer !== 'undefined'
		            ? {
		                decode(buf) {
		                    const out = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
		                    return out.toString();
		                },
		            }
		            : {
		                decode(buf) {
		                    let out = '';
		                    for (let i = 0; i < buf.length; i++) {
		                        out += String.fromCharCode(buf[i]);
		                    }
		                    return out;
		                },
		            };
		    class StringWriter {
		        constructor() {
		            this.pos = 0;
		            this.out = '';
		            this.buffer = new Uint8Array(bufLength);
		        }
		        write(v) {
		            const { buffer } = this;
		            buffer[this.pos++] = v;
		            if (this.pos === bufLength) {
		                this.out += td.decode(buffer);
		                this.pos = 0;
		            }
		        }
		        flush() {
		            const { buffer, out, pos } = this;
		            return pos > 0 ? out + td.decode(buffer.subarray(0, pos)) : out;
		        }
		    }
		    class StringReader {
		        constructor(buffer) {
		            this.pos = 0;
		            this.buffer = buffer;
		        }
		        next() {
		            return this.buffer.charCodeAt(this.pos++);
		        }
		        peek() {
		            return this.buffer.charCodeAt(this.pos);
		        }
		        indexOf(char) {
		            const { buffer, pos } = this;
		            const idx = buffer.indexOf(char, pos);
		            return idx === -1 ? buffer.length : idx;
		        }
		    }

		    const EMPTY = [];
		    function decodeOriginalScopes(input) {
		        const { length } = input;
		        const reader = new StringReader(input);
		        const scopes = [];
		        const stack = [];
		        let line = 0;
		        for (; reader.pos < length; reader.pos++) {
		            line = decodeInteger(reader, line);
		            const column = decodeInteger(reader, 0);
		            if (!hasMoreVlq(reader, length)) {
		                const last = stack.pop();
		                last[2] = line;
		                last[3] = column;
		                continue;
		            }
		            const kind = decodeInteger(reader, 0);
		            const fields = decodeInteger(reader, 0);
		            const hasName = fields & 0b0001;
		            const scope = (hasName ? [line, column, 0, 0, kind, decodeInteger(reader, 0)] : [line, column, 0, 0, kind]);
		            let vars = EMPTY;
		            if (hasMoreVlq(reader, length)) {
		                vars = [];
		                do {
		                    const varsIndex = decodeInteger(reader, 0);
		                    vars.push(varsIndex);
		                } while (hasMoreVlq(reader, length));
		            }
		            scope.vars = vars;
		            scopes.push(scope);
		            stack.push(scope);
		        }
		        return scopes;
		    }
		    function encodeOriginalScopes(scopes) {
		        const writer = new StringWriter();
		        for (let i = 0; i < scopes.length;) {
		            i = _encodeOriginalScopes(scopes, i, writer, [0]);
		        }
		        return writer.flush();
		    }
		    function _encodeOriginalScopes(scopes, index, writer, state) {
		        const scope = scopes[index];
		        const { 0: startLine, 1: startColumn, 2: endLine, 3: endColumn, 4: kind, vars } = scope;
		        if (index > 0)
		            writer.write(comma);
		        state[0] = encodeInteger(writer, startLine, state[0]);
		        encodeInteger(writer, startColumn, 0);
		        encodeInteger(writer, kind, 0);
		        const fields = scope.length === 6 ? 0b0001 : 0;
		        encodeInteger(writer, fields, 0);
		        if (scope.length === 6)
		            encodeInteger(writer, scope[5], 0);
		        for (const v of vars) {
		            encodeInteger(writer, v, 0);
		        }
		        for (index++; index < scopes.length;) {
		            const next = scopes[index];
		            const { 0: l, 1: c } = next;
		            if (l > endLine || (l === endLine && c >= endColumn)) {
		                break;
		            }
		            index = _encodeOriginalScopes(scopes, index, writer, state);
		        }
		        writer.write(comma);
		        state[0] = encodeInteger(writer, endLine, state[0]);
		        encodeInteger(writer, endColumn, 0);
		        return index;
		    }
		    function decodeGeneratedRanges(input) {
		        const { length } = input;
		        const reader = new StringReader(input);
		        const ranges = [];
		        const stack = [];
		        let genLine = 0;
		        let definitionSourcesIndex = 0;
		        let definitionScopeIndex = 0;
		        let callsiteSourcesIndex = 0;
		        let callsiteLine = 0;
		        let callsiteColumn = 0;
		        let bindingLine = 0;
		        let bindingColumn = 0;
		        do {
		            const semi = reader.indexOf(';');
		            let genColumn = 0;
		            for (; reader.pos < semi; reader.pos++) {
		                genColumn = decodeInteger(reader, genColumn);
		                if (!hasMoreVlq(reader, semi)) {
		                    const last = stack.pop();
		                    last[2] = genLine;
		                    last[3] = genColumn;
		                    continue;
		                }
		                const fields = decodeInteger(reader, 0);
		                const hasDefinition = fields & 0b0001;
		                const hasCallsite = fields & 0b0010;
		                const hasScope = fields & 0b0100;
		                let callsite = null;
		                let bindings = EMPTY;
		                let range;
		                if (hasDefinition) {
		                    const defSourcesIndex = decodeInteger(reader, definitionSourcesIndex);
		                    definitionScopeIndex = decodeInteger(reader, definitionSourcesIndex === defSourcesIndex ? definitionScopeIndex : 0);
		                    definitionSourcesIndex = defSourcesIndex;
		                    range = [genLine, genColumn, 0, 0, defSourcesIndex, definitionScopeIndex];
		                }
		                else {
		                    range = [genLine, genColumn, 0, 0];
		                }
		                range.isScope = !!hasScope;
		                if (hasCallsite) {
		                    const prevCsi = callsiteSourcesIndex;
		                    const prevLine = callsiteLine;
		                    callsiteSourcesIndex = decodeInteger(reader, callsiteSourcesIndex);
		                    const sameSource = prevCsi === callsiteSourcesIndex;
		                    callsiteLine = decodeInteger(reader, sameSource ? callsiteLine : 0);
		                    callsiteColumn = decodeInteger(reader, sameSource && prevLine === callsiteLine ? callsiteColumn : 0);
		                    callsite = [callsiteSourcesIndex, callsiteLine, callsiteColumn];
		                }
		                range.callsite = callsite;
		                if (hasMoreVlq(reader, semi)) {
		                    bindings = [];
		                    do {
		                        bindingLine = genLine;
		                        bindingColumn = genColumn;
		                        const expressionsCount = decodeInteger(reader, 0);
		                        let expressionRanges;
		                        if (expressionsCount < -1) {
		                            expressionRanges = [[decodeInteger(reader, 0)]];
		                            for (let i = -1; i > expressionsCount; i--) {
		                                const prevBl = bindingLine;
		                                bindingLine = decodeInteger(reader, bindingLine);
		                                bindingColumn = decodeInteger(reader, bindingLine === prevBl ? bindingColumn : 0);
		                                const expression = decodeInteger(reader, 0);
		                                expressionRanges.push([expression, bindingLine, bindingColumn]);
		                            }
		                        }
		                        else {
		                            expressionRanges = [[expressionsCount]];
		                        }
		                        bindings.push(expressionRanges);
		                    } while (hasMoreVlq(reader, semi));
		                }
		                range.bindings = bindings;
		                ranges.push(range);
		                stack.push(range);
		            }
		            genLine++;
		            reader.pos = semi + 1;
		        } while (reader.pos < length);
		        return ranges;
		    }
		    function encodeGeneratedRanges(ranges) {
		        if (ranges.length === 0)
		            return '';
		        const writer = new StringWriter();
		        for (let i = 0; i < ranges.length;) {
		            i = _encodeGeneratedRanges(ranges, i, writer, [0, 0, 0, 0, 0, 0, 0]);
		        }
		        return writer.flush();
		    }
		    function _encodeGeneratedRanges(ranges, index, writer, state) {
		        const range = ranges[index];
		        const { 0: startLine, 1: startColumn, 2: endLine, 3: endColumn, isScope, callsite, bindings, } = range;
		        if (state[0] < startLine) {
		            catchupLine(writer, state[0], startLine);
		            state[0] = startLine;
		            state[1] = 0;
		        }
		        else if (index > 0) {
		            writer.write(comma);
		        }
		        state[1] = encodeInteger(writer, range[1], state[1]);
		        const fields = (range.length === 6 ? 0b0001 : 0) | (callsite ? 0b0010 : 0) | (isScope ? 0b0100 : 0);
		        encodeInteger(writer, fields, 0);
		        if (range.length === 6) {
		            const { 4: sourcesIndex, 5: scopesIndex } = range;
		            if (sourcesIndex !== state[2]) {
		                state[3] = 0;
		            }
		            state[2] = encodeInteger(writer, sourcesIndex, state[2]);
		            state[3] = encodeInteger(writer, scopesIndex, state[3]);
		        }
		        if (callsite) {
		            const { 0: sourcesIndex, 1: callLine, 2: callColumn } = range.callsite;
		            if (sourcesIndex !== state[4]) {
		                state[5] = 0;
		                state[6] = 0;
		            }
		            else if (callLine !== state[5]) {
		                state[6] = 0;
		            }
		            state[4] = encodeInteger(writer, sourcesIndex, state[4]);
		            state[5] = encodeInteger(writer, callLine, state[5]);
		            state[6] = encodeInteger(writer, callColumn, state[6]);
		        }
		        if (bindings) {
		            for (const binding of bindings) {
		                if (binding.length > 1)
		                    encodeInteger(writer, -binding.length, 0);
		                const expression = binding[0][0];
		                encodeInteger(writer, expression, 0);
		                let bindingStartLine = startLine;
		                let bindingStartColumn = startColumn;
		                for (let i = 1; i < binding.length; i++) {
		                    const expRange = binding[i];
		                    bindingStartLine = encodeInteger(writer, expRange[1], bindingStartLine);
		                    bindingStartColumn = encodeInteger(writer, expRange[2], bindingStartColumn);
		                    encodeInteger(writer, expRange[0], 0);
		                }
		            }
		        }
		        for (index++; index < ranges.length;) {
		            const next = ranges[index];
		            const { 0: l, 1: c } = next;
		            if (l > endLine || (l === endLine && c >= endColumn)) {
		                break;
		            }
		            index = _encodeGeneratedRanges(ranges, index, writer, state);
		        }
		        if (state[0] < endLine) {
		            catchupLine(writer, state[0], endLine);
		            state[0] = endLine;
		            state[1] = 0;
		        }
		        else {
		            writer.write(comma);
		        }
		        state[1] = encodeInteger(writer, endColumn, state[1]);
		        return index;
		    }
		    function catchupLine(writer, lastLine, line) {
		        do {
		            writer.write(semicolon);
		        } while (++lastLine < line);
		    }

		    function decode(mappings) {
		        const { length } = mappings;
		        const reader = new StringReader(mappings);
		        const decoded = [];
		        let genColumn = 0;
		        let sourcesIndex = 0;
		        let sourceLine = 0;
		        let sourceColumn = 0;
		        let namesIndex = 0;
		        do {
		            const semi = reader.indexOf(';');
		            const line = [];
		            let sorted = true;
		            let lastCol = 0;
		            genColumn = 0;
		            while (reader.pos < semi) {
		                let seg;
		                genColumn = decodeInteger(reader, genColumn);
		                if (genColumn < lastCol)
		                    sorted = false;
		                lastCol = genColumn;
		                if (hasMoreVlq(reader, semi)) {
		                    sourcesIndex = decodeInteger(reader, sourcesIndex);
		                    sourceLine = decodeInteger(reader, sourceLine);
		                    sourceColumn = decodeInteger(reader, sourceColumn);
		                    if (hasMoreVlq(reader, semi)) {
		                        namesIndex = decodeInteger(reader, namesIndex);
		                        seg = [genColumn, sourcesIndex, sourceLine, sourceColumn, namesIndex];
		                    }
		                    else {
		                        seg = [genColumn, sourcesIndex, sourceLine, sourceColumn];
		                    }
		                }
		                else {
		                    seg = [genColumn];
		                }
		                line.push(seg);
		                reader.pos++;
		            }
		            if (!sorted)
		                sort(line);
		            decoded.push(line);
		            reader.pos = semi + 1;
		        } while (reader.pos <= length);
		        return decoded;
		    }
		    function sort(line) {
		        line.sort(sortComparator);
		    }
		    function sortComparator(a, b) {
		        return a[0] - b[0];
		    }
		    function encode(decoded) {
		        const writer = new StringWriter();
		        let sourcesIndex = 0;
		        let sourceLine = 0;
		        let sourceColumn = 0;
		        let namesIndex = 0;
		        for (let i = 0; i < decoded.length; i++) {
		            const line = decoded[i];
		            if (i > 0)
		                writer.write(semicolon);
		            if (line.length === 0)
		                continue;
		            let genColumn = 0;
		            for (let j = 0; j < line.length; j++) {
		                const segment = line[j];
		                if (j > 0)
		                    writer.write(comma);
		                genColumn = encodeInteger(writer, segment[0], genColumn);
		                if (segment.length === 1)
		                    continue;
		                sourcesIndex = encodeInteger(writer, segment[1], sourcesIndex);
		                sourceLine = encodeInteger(writer, segment[2], sourceLine);
		                sourceColumn = encodeInteger(writer, segment[3], sourceColumn);
		                if (segment.length === 4)
		                    continue;
		                namesIndex = encodeInteger(writer, segment[4], namesIndex);
		            }
		        }
		        return writer.flush();
		    }

		    exports.decode = decode;
		    exports.decodeGeneratedRanges = decodeGeneratedRanges;
		    exports.decodeOriginalScopes = decodeOriginalScopes;
		    exports.encode = encode;
		    exports.encodeGeneratedRanges = encodeGeneratedRanges;
		    exports.encodeOriginalScopes = encodeOriginalScopes;

		    Object.defineProperty(exports, '__esModule', { value: true });

		}));
		
	} (sourcemapCodec_umd$1, sourcemapCodec_umd$1.exports));
	return sourcemapCodec_umd$1.exports;
}

var sourcemapCodec_umdExports = requireSourcemapCodec_umd();

class BitSet {
	constructor(arg) {
		this.bits = arg instanceof BitSet ? arg.bits.slice() : [];
	}

	add(n) {
		this.bits[n >> 5] |= 1 << (n & 31);
	}

	has(n) {
		return !!(this.bits[n >> 5] & (1 << (n & 31)));
	}
}

class Chunk {
	constructor(start, end, content) {
		this.start = start;
		this.end = end;
		this.original = content;

		this.intro = '';
		this.outro = '';

		this.content = content;
		this.storeName = false;
		this.edited = false;

		{
			this.previous = null;
			this.next = null;
		}
	}

	appendLeft(content) {
		this.outro += content;
	}

	appendRight(content) {
		this.intro = this.intro + content;
	}

	clone() {
		const chunk = new Chunk(this.start, this.end, this.original);

		chunk.intro = this.intro;
		chunk.outro = this.outro;
		chunk.content = this.content;
		chunk.storeName = this.storeName;
		chunk.edited = this.edited;

		return chunk;
	}

	contains(index) {
		return this.start < index && index < this.end;
	}

	eachNext(fn) {
		let chunk = this;
		while (chunk) {
			fn(chunk);
			chunk = chunk.next;
		}
	}

	eachPrevious(fn) {
		let chunk = this;
		while (chunk) {
			fn(chunk);
			chunk = chunk.previous;
		}
	}

	edit(content, storeName, contentOnly) {
		this.content = content;
		if (!contentOnly) {
			this.intro = '';
			this.outro = '';
		}
		this.storeName = storeName;

		this.edited = true;

		return this;
	}

	prependLeft(content) {
		this.outro = content + this.outro;
	}

	prependRight(content) {
		this.intro = content + this.intro;
	}

	reset() {
		this.intro = '';
		this.outro = '';
		if (this.edited) {
			this.content = this.original;
			this.storeName = false;
			this.edited = false;
		}
	}

	split(index) {
		const sliceIndex = index - this.start;

		const originalBefore = this.original.slice(0, sliceIndex);
		const originalAfter = this.original.slice(sliceIndex);

		this.original = originalBefore;

		const newChunk = new Chunk(index, this.end, originalAfter);
		newChunk.outro = this.outro;
		this.outro = '';

		this.end = index;

		if (this.edited) {
			// after split we should save the edit content record into the correct chunk
			// to make sure sourcemap correct
			// For example:
			// '  test'.trim()
			//     split   -> '  ' + 'test'
			//   ✔️ edit    -> '' + 'test'
			//   ✖️ edit    -> 'test' + ''
			// TODO is this block necessary?...
			newChunk.edit('', false);
			this.content = '';
		} else {
			this.content = originalBefore;
		}

		newChunk.next = this.next;
		if (newChunk.next) newChunk.next.previous = newChunk;
		newChunk.previous = this;
		this.next = newChunk;

		return newChunk;
	}

	toString() {
		return this.intro + this.content + this.outro;
	}

	trimEnd(rx) {
		this.outro = this.outro.replace(rx, '');
		if (this.outro.length) return true;

		const trimmed = this.content.replace(rx, '');

		if (trimmed.length) {
			if (trimmed !== this.content) {
				this.split(this.start + trimmed.length).edit('', undefined, true);
				if (this.edited) {
					// save the change, if it has been edited
					this.edit(trimmed, this.storeName, true);
				}
			}
			return true;
		} else {
			this.edit('', undefined, true);

			this.intro = this.intro.replace(rx, '');
			if (this.intro.length) return true;
		}
	}

	trimStart(rx) {
		this.intro = this.intro.replace(rx, '');
		if (this.intro.length) return true;

		const trimmed = this.content.replace(rx, '');

		if (trimmed.length) {
			if (trimmed !== this.content) {
				const newChunk = this.split(this.end - trimmed.length);
				if (this.edited) {
					// save the change, if it has been edited
					newChunk.edit(trimmed, this.storeName, true);
				}
				this.edit('', undefined, true);
			}
			return true;
		} else {
			this.edit('', undefined, true);

			this.outro = this.outro.replace(rx, '');
			if (this.outro.length) return true;
		}
	}
}

function getBtoa() {
	if (typeof globalThis !== 'undefined' && typeof globalThis.btoa === 'function') {
		return (str) => globalThis.btoa(unescape(encodeURIComponent(str)));
	} else if (typeof Buffer === 'function') {
		return (str) => Buffer.from(str, 'utf-8').toString('base64');
	} else {
		return () => {
			throw new Error('Unsupported environment: `window.btoa` or `Buffer` should be supported.');
		};
	}
}

const btoa = /*#__PURE__*/ getBtoa();

class SourceMap {
	constructor(properties) {
		this.version = 3;
		this.file = properties.file;
		this.sources = properties.sources;
		this.sourcesContent = properties.sourcesContent;
		this.names = properties.names;
		this.mappings = sourcemapCodec_umdExports.encode(properties.mappings);
		if (typeof properties.x_google_ignoreList !== 'undefined') {
			this.x_google_ignoreList = properties.x_google_ignoreList;
		}
		if (typeof properties.debugId !== 'undefined') {
			this.debugId = properties.debugId;
		}
	}

	toString() {
		return JSON.stringify(this);
	}

	toUrl() {
		return 'data:application/json;charset=utf-8;base64,' + btoa(this.toString());
	}
}

function guessIndent(code) {
	const lines = code.split('\n');

	const tabbed = lines.filter((line) => /^\t+/.test(line));
	const spaced = lines.filter((line) => /^ {2,}/.test(line));

	if (tabbed.length === 0 && spaced.length === 0) {
		return null;
	}

	// More lines tabbed than spaced? Assume tabs, and
	// default to tabs in the case of a tie (or nothing
	// to go on)
	if (tabbed.length >= spaced.length) {
		return '\t';
	}

	// Otherwise, we need to guess the multiple
	const min = spaced.reduce((previous, current) => {
		const numSpaces = /^ +/.exec(current)[0].length;
		return Math.min(numSpaces, previous);
	}, Infinity);

	return new Array(min + 1).join(' ');
}

function getRelativePath(from, to) {
	const fromParts = from.split(/[/\\]/);
	const toParts = to.split(/[/\\]/);

	fromParts.pop(); // get dirname

	while (fromParts[0] === toParts[0]) {
		fromParts.shift();
		toParts.shift();
	}

	if (fromParts.length) {
		let i = fromParts.length;
		while (i--) fromParts[i] = '..';
	}

	return fromParts.concat(toParts).join('/');
}

const toString = Object.prototype.toString;

function isObject(thing) {
	return toString.call(thing) === '[object Object]';
}

function getLocator(source) {
	const originalLines = source.split('\n');
	const lineOffsets = [];

	for (let i = 0, pos = 0; i < originalLines.length; i++) {
		lineOffsets.push(pos);
		pos += originalLines[i].length + 1;
	}

	return function locate(index) {
		let i = 0;
		let j = lineOffsets.length;
		while (i < j) {
			const m = (i + j) >> 1;
			if (index < lineOffsets[m]) {
				j = m;
			} else {
				i = m + 1;
			}
		}
		const line = i - 1;
		const column = index - lineOffsets[line];
		return { line, column };
	};
}

const wordRegex = /\w/;

class Mappings {
	constructor(hires) {
		this.hires = hires;
		this.generatedCodeLine = 0;
		this.generatedCodeColumn = 0;
		this.raw = [];
		this.rawSegments = this.raw[this.generatedCodeLine] = [];
		this.pending = null;
	}

	addEdit(sourceIndex, content, loc, nameIndex) {
		if (content.length) {
			const contentLengthMinusOne = content.length - 1;
			let contentLineEnd = content.indexOf('\n', 0);
			let previousContentLineEnd = -1;
			// Loop through each line in the content and add a segment, but stop if the last line is empty,
			// else code afterwards would fill one line too many
			while (contentLineEnd >= 0 && contentLengthMinusOne > contentLineEnd) {
				const segment = [this.generatedCodeColumn, sourceIndex, loc.line, loc.column];
				if (nameIndex >= 0) {
					segment.push(nameIndex);
				}
				this.rawSegments.push(segment);

				this.generatedCodeLine += 1;
				this.raw[this.generatedCodeLine] = this.rawSegments = [];
				this.generatedCodeColumn = 0;

				previousContentLineEnd = contentLineEnd;
				contentLineEnd = content.indexOf('\n', contentLineEnd + 1);
			}

			const segment = [this.generatedCodeColumn, sourceIndex, loc.line, loc.column];
			if (nameIndex >= 0) {
				segment.push(nameIndex);
			}
			this.rawSegments.push(segment);

			this.advance(content.slice(previousContentLineEnd + 1));
		} else if (this.pending) {
			this.rawSegments.push(this.pending);
			this.advance(content);
		}

		this.pending = null;
	}

	addUneditedChunk(sourceIndex, chunk, original, loc, sourcemapLocations) {
		let originalCharIndex = chunk.start;
		let first = true;
		// when iterating each char, check if it's in a word boundary
		let charInHiresBoundary = false;

		while (originalCharIndex < chunk.end) {
			if (original[originalCharIndex] === '\n') {
				loc.line += 1;
				loc.column = 0;
				this.generatedCodeLine += 1;
				this.raw[this.generatedCodeLine] = this.rawSegments = [];
				this.generatedCodeColumn = 0;
				first = true;
				charInHiresBoundary = false;
			} else {
				if (this.hires || first || sourcemapLocations.has(originalCharIndex)) {
					const segment = [this.generatedCodeColumn, sourceIndex, loc.line, loc.column];

					if (this.hires === 'boundary') {
						// in hires "boundary", group segments per word boundary than per char
						if (wordRegex.test(original[originalCharIndex])) {
							// for first char in the boundary found, start the boundary by pushing a segment
							if (!charInHiresBoundary) {
								this.rawSegments.push(segment);
								charInHiresBoundary = true;
							}
						} else {
							// for non-word char, end the boundary by pushing a segment
							this.rawSegments.push(segment);
							charInHiresBoundary = false;
						}
					} else {
						this.rawSegments.push(segment);
					}
				}

				loc.column += 1;
				this.generatedCodeColumn += 1;
				first = false;
			}

			originalCharIndex += 1;
		}

		this.pending = null;
	}

	advance(str) {
		if (!str) return;

		const lines = str.split('\n');

		if (lines.length > 1) {
			for (let i = 0; i < lines.length - 1; i++) {
				this.generatedCodeLine++;
				this.raw[this.generatedCodeLine] = this.rawSegments = [];
			}
			this.generatedCodeColumn = 0;
		}

		this.generatedCodeColumn += lines[lines.length - 1].length;
	}
}

const n = '\n';

const warned = {
	insertLeft: false,
	insertRight: false,
	storeName: false,
};

class MagicString {
	constructor(string, options = {}) {
		const chunk = new Chunk(0, string.length, string);

		Object.defineProperties(this, {
			original: { writable: true, value: string },
			outro: { writable: true, value: '' },
			intro: { writable: true, value: '' },
			firstChunk: { writable: true, value: chunk },
			lastChunk: { writable: true, value: chunk },
			lastSearchedChunk: { writable: true, value: chunk },
			byStart: { writable: true, value: {} },
			byEnd: { writable: true, value: {} },
			filename: { writable: true, value: options.filename },
			indentExclusionRanges: { writable: true, value: options.indentExclusionRanges },
			sourcemapLocations: { writable: true, value: new BitSet() },
			storedNames: { writable: true, value: {} },
			indentStr: { writable: true, value: undefined },
			ignoreList: { writable: true, value: options.ignoreList },
			offset: { writable: true, value: options.offset || 0 },
		});

		this.byStart[0] = chunk;
		this.byEnd[string.length] = chunk;
	}

	addSourcemapLocation(char) {
		this.sourcemapLocations.add(char);
	}

	append(content) {
		if (typeof content !== 'string') throw new TypeError('outro content must be a string');

		this.outro += content;
		return this;
	}

	appendLeft(index, content) {
		index = index + this.offset;

		if (typeof content !== 'string') throw new TypeError('inserted content must be a string');

		this._split(index);

		const chunk = this.byEnd[index];

		if (chunk) {
			chunk.appendLeft(content);
		} else {
			this.intro += content;
		}
		return this;
	}

	appendRight(index, content) {
		index = index + this.offset;

		if (typeof content !== 'string') throw new TypeError('inserted content must be a string');

		this._split(index);

		const chunk = this.byStart[index];

		if (chunk) {
			chunk.appendRight(content);
		} else {
			this.outro += content;
		}
		return this;
	}

	clone() {
		const cloned = new MagicString(this.original, { filename: this.filename, offset: this.offset });

		let originalChunk = this.firstChunk;
		let clonedChunk = (cloned.firstChunk = cloned.lastSearchedChunk = originalChunk.clone());

		while (originalChunk) {
			cloned.byStart[clonedChunk.start] = clonedChunk;
			cloned.byEnd[clonedChunk.end] = clonedChunk;

			const nextOriginalChunk = originalChunk.next;
			const nextClonedChunk = nextOriginalChunk && nextOriginalChunk.clone();

			if (nextClonedChunk) {
				clonedChunk.next = nextClonedChunk;
				nextClonedChunk.previous = clonedChunk;

				clonedChunk = nextClonedChunk;
			}

			originalChunk = nextOriginalChunk;
		}

		cloned.lastChunk = clonedChunk;

		if (this.indentExclusionRanges) {
			cloned.indentExclusionRanges = this.indentExclusionRanges.slice();
		}

		cloned.sourcemapLocations = new BitSet(this.sourcemapLocations);

		cloned.intro = this.intro;
		cloned.outro = this.outro;

		return cloned;
	}

	generateDecodedMap(options) {
		options = options || {};

		const sourceIndex = 0;
		const names = Object.keys(this.storedNames);
		const mappings = new Mappings(options.hires);

		const locate = getLocator(this.original);

		if (this.intro) {
			mappings.advance(this.intro);
		}

		this.firstChunk.eachNext((chunk) => {
			const loc = locate(chunk.start);

			if (chunk.intro.length) mappings.advance(chunk.intro);

			if (chunk.edited) {
				mappings.addEdit(
					sourceIndex,
					chunk.content,
					loc,
					chunk.storeName ? names.indexOf(chunk.original) : -1,
				);
			} else {
				mappings.addUneditedChunk(sourceIndex, chunk, this.original, loc, this.sourcemapLocations);
			}

			if (chunk.outro.length) mappings.advance(chunk.outro);
		});

		return {
			file: options.file ? options.file.split(/[/\\]/).pop() : undefined,
			sources: [
				options.source ? getRelativePath(options.file || '', options.source) : options.file || '',
			],
			sourcesContent: options.includeContent ? [this.original] : undefined,
			names,
			mappings: mappings.raw,
			x_google_ignoreList: this.ignoreList ? [sourceIndex] : undefined,
		};
	}

	generateMap(options) {
		return new SourceMap(this.generateDecodedMap(options));
	}

	_ensureindentStr() {
		if (this.indentStr === undefined) {
			this.indentStr = guessIndent(this.original);
		}
	}

	_getRawIndentString() {
		this._ensureindentStr();
		return this.indentStr;
	}

	getIndentString() {
		this._ensureindentStr();
		return this.indentStr === null ? '\t' : this.indentStr;
	}

	indent(indentStr, options) {
		const pattern = /^[^\r\n]/gm;

		if (isObject(indentStr)) {
			options = indentStr;
			indentStr = undefined;
		}

		if (indentStr === undefined) {
			this._ensureindentStr();
			indentStr = this.indentStr || '\t';
		}

		if (indentStr === '') return this; // noop

		options = options || {};

		// Process exclusion ranges
		const isExcluded = {};

		if (options.exclude) {
			const exclusions =
				typeof options.exclude[0] === 'number' ? [options.exclude] : options.exclude;
			exclusions.forEach((exclusion) => {
				for (let i = exclusion[0]; i < exclusion[1]; i += 1) {
					isExcluded[i] = true;
				}
			});
		}

		let shouldIndentNextCharacter = options.indentStart !== false;
		const replacer = (match) => {
			if (shouldIndentNextCharacter) return `${indentStr}${match}`;
			shouldIndentNextCharacter = true;
			return match;
		};

		this.intro = this.intro.replace(pattern, replacer);

		let charIndex = 0;
		let chunk = this.firstChunk;

		while (chunk) {
			const end = chunk.end;

			if (chunk.edited) {
				if (!isExcluded[charIndex]) {
					chunk.content = chunk.content.replace(pattern, replacer);

					if (chunk.content.length) {
						shouldIndentNextCharacter = chunk.content[chunk.content.length - 1] === '\n';
					}
				}
			} else {
				charIndex = chunk.start;

				while (charIndex < end) {
					if (!isExcluded[charIndex]) {
						const char = this.original[charIndex];

						if (char === '\n') {
							shouldIndentNextCharacter = true;
						} else if (char !== '\r' && shouldIndentNextCharacter) {
							shouldIndentNextCharacter = false;

							if (charIndex === chunk.start) {
								chunk.prependRight(indentStr);
							} else {
								this._splitChunk(chunk, charIndex);
								chunk = chunk.next;
								chunk.prependRight(indentStr);
							}
						}
					}

					charIndex += 1;
				}
			}

			charIndex = chunk.end;
			chunk = chunk.next;
		}

		this.outro = this.outro.replace(pattern, replacer);

		return this;
	}

	insert() {
		throw new Error(
			'magicString.insert(...) is deprecated. Use prependRight(...) or appendLeft(...)',
		);
	}

	insertLeft(index, content) {
		if (!warned.insertLeft) {
			console.warn(
				'magicString.insertLeft(...) is deprecated. Use magicString.appendLeft(...) instead',
			);
			warned.insertLeft = true;
		}

		return this.appendLeft(index, content);
	}

	insertRight(index, content) {
		if (!warned.insertRight) {
			console.warn(
				'magicString.insertRight(...) is deprecated. Use magicString.prependRight(...) instead',
			);
			warned.insertRight = true;
		}

		return this.prependRight(index, content);
	}

	move(start, end, index) {
		start = start + this.offset;
		end = end + this.offset;
		index = index + this.offset;

		if (index >= start && index <= end) throw new Error('Cannot move a selection inside itself');

		this._split(start);
		this._split(end);
		this._split(index);

		const first = this.byStart[start];
		const last = this.byEnd[end];

		const oldLeft = first.previous;
		const oldRight = last.next;

		const newRight = this.byStart[index];
		if (!newRight && last === this.lastChunk) return this;
		const newLeft = newRight ? newRight.previous : this.lastChunk;

		if (oldLeft) oldLeft.next = oldRight;
		if (oldRight) oldRight.previous = oldLeft;

		if (newLeft) newLeft.next = first;
		if (newRight) newRight.previous = last;

		if (!first.previous) this.firstChunk = last.next;
		if (!last.next) {
			this.lastChunk = first.previous;
			this.lastChunk.next = null;
		}

		first.previous = newLeft;
		last.next = newRight || null;

		if (!newLeft) this.firstChunk = first;
		if (!newRight) this.lastChunk = last;
		return this;
	}

	overwrite(start, end, content, options) {
		options = options || {};
		return this.update(start, end, content, { ...options, overwrite: !options.contentOnly });
	}

	update(start, end, content, options) {
		start = start + this.offset;
		end = end + this.offset;

		if (typeof content !== 'string') throw new TypeError('replacement content must be a string');

		if (this.original.length !== 0) {
			while (start < 0) start += this.original.length;
			while (end < 0) end += this.original.length;
		}

		if (end > this.original.length) throw new Error('end is out of bounds');
		if (start === end)
			throw new Error(
				'Cannot overwrite a zero-length range – use appendLeft or prependRight instead',
			);

		this._split(start);
		this._split(end);

		if (options === true) {
			if (!warned.storeName) {
				console.warn(
					'The final argument to magicString.overwrite(...) should be an options object. See https://github.com/rich-harris/magic-string',
				);
				warned.storeName = true;
			}

			options = { storeName: true };
		}
		const storeName = options !== undefined ? options.storeName : false;
		const overwrite = options !== undefined ? options.overwrite : false;

		if (storeName) {
			const original = this.original.slice(start, end);
			Object.defineProperty(this.storedNames, original, {
				writable: true,
				value: true,
				enumerable: true,
			});
		}

		const first = this.byStart[start];
		const last = this.byEnd[end];

		if (first) {
			let chunk = first;
			while (chunk !== last) {
				if (chunk.next !== this.byStart[chunk.end]) {
					throw new Error('Cannot overwrite across a split point');
				}
				chunk = chunk.next;
				chunk.edit('', false);
			}

			first.edit(content, storeName, !overwrite);
		} else {
			// must be inserting at the end
			const newChunk = new Chunk(start, end, '').edit(content, storeName);

			// TODO last chunk in the array may not be the last chunk, if it's moved...
			last.next = newChunk;
			newChunk.previous = last;
		}
		return this;
	}

	prepend(content) {
		if (typeof content !== 'string') throw new TypeError('outro content must be a string');

		this.intro = content + this.intro;
		return this;
	}

	prependLeft(index, content) {
		index = index + this.offset;

		if (typeof content !== 'string') throw new TypeError('inserted content must be a string');

		this._split(index);

		const chunk = this.byEnd[index];

		if (chunk) {
			chunk.prependLeft(content);
		} else {
			this.intro = content + this.intro;
		}
		return this;
	}

	prependRight(index, content) {
		index = index + this.offset;

		if (typeof content !== 'string') throw new TypeError('inserted content must be a string');

		this._split(index);

		const chunk = this.byStart[index];

		if (chunk) {
			chunk.prependRight(content);
		} else {
			this.outro = content + this.outro;
		}
		return this;
	}

	remove(start, end) {
		start = start + this.offset;
		end = end + this.offset;

		if (this.original.length !== 0) {
			while (start < 0) start += this.original.length;
			while (end < 0) end += this.original.length;
		}

		if (start === end) return this;

		if (start < 0 || end > this.original.length) throw new Error('Character is out of bounds');
		if (start > end) throw new Error('end must be greater than start');

		this._split(start);
		this._split(end);

		let chunk = this.byStart[start];

		while (chunk) {
			chunk.intro = '';
			chunk.outro = '';
			chunk.edit('');

			chunk = end > chunk.end ? this.byStart[chunk.end] : null;
		}
		return this;
	}

	reset(start, end) {
		start = start + this.offset;
		end = end + this.offset;

		if (this.original.length !== 0) {
			while (start < 0) start += this.original.length;
			while (end < 0) end += this.original.length;
		}

		if (start === end) return this;

		if (start < 0 || end > this.original.length) throw new Error('Character is out of bounds');
		if (start > end) throw new Error('end must be greater than start');

		this._split(start);
		this._split(end);

		let chunk = this.byStart[start];

		while (chunk) {
			chunk.reset();

			chunk = end > chunk.end ? this.byStart[chunk.end] : null;
		}
		return this;
	}

	lastChar() {
		if (this.outro.length) return this.outro[this.outro.length - 1];
		let chunk = this.lastChunk;
		do {
			if (chunk.outro.length) return chunk.outro[chunk.outro.length - 1];
			if (chunk.content.length) return chunk.content[chunk.content.length - 1];
			if (chunk.intro.length) return chunk.intro[chunk.intro.length - 1];
		} while ((chunk = chunk.previous));
		if (this.intro.length) return this.intro[this.intro.length - 1];
		return '';
	}

	lastLine() {
		let lineIndex = this.outro.lastIndexOf(n);
		if (lineIndex !== -1) return this.outro.substr(lineIndex + 1);
		let lineStr = this.outro;
		let chunk = this.lastChunk;
		do {
			if (chunk.outro.length > 0) {
				lineIndex = chunk.outro.lastIndexOf(n);
				if (lineIndex !== -1) return chunk.outro.substr(lineIndex + 1) + lineStr;
				lineStr = chunk.outro + lineStr;
			}

			if (chunk.content.length > 0) {
				lineIndex = chunk.content.lastIndexOf(n);
				if (lineIndex !== -1) return chunk.content.substr(lineIndex + 1) + lineStr;
				lineStr = chunk.content + lineStr;
			}

			if (chunk.intro.length > 0) {
				lineIndex = chunk.intro.lastIndexOf(n);
				if (lineIndex !== -1) return chunk.intro.substr(lineIndex + 1) + lineStr;
				lineStr = chunk.intro + lineStr;
			}
		} while ((chunk = chunk.previous));
		lineIndex = this.intro.lastIndexOf(n);
		if (lineIndex !== -1) return this.intro.substr(lineIndex + 1) + lineStr;
		return this.intro + lineStr;
	}

	slice(start = 0, end = this.original.length - this.offset) {
		start = start + this.offset;
		end = end + this.offset;

		if (this.original.length !== 0) {
			while (start < 0) start += this.original.length;
			while (end < 0) end += this.original.length;
		}

		let result = '';

		// find start chunk
		let chunk = this.firstChunk;
		while (chunk && (chunk.start > start || chunk.end <= start)) {
			// found end chunk before start
			if (chunk.start < end && chunk.end >= end) {
				return result;
			}

			chunk = chunk.next;
		}

		if (chunk && chunk.edited && chunk.start !== start)
			throw new Error(`Cannot use replaced character ${start} as slice start anchor.`);

		const startChunk = chunk;
		while (chunk) {
			if (chunk.intro && (startChunk !== chunk || chunk.start === start)) {
				result += chunk.intro;
			}

			const containsEnd = chunk.start < end && chunk.end >= end;
			if (containsEnd && chunk.edited && chunk.end !== end)
				throw new Error(`Cannot use replaced character ${end} as slice end anchor.`);

			const sliceStart = startChunk === chunk ? start - chunk.start : 0;
			const sliceEnd = containsEnd ? chunk.content.length + end - chunk.end : chunk.content.length;

			result += chunk.content.slice(sliceStart, sliceEnd);

			if (chunk.outro && (!containsEnd || chunk.end === end)) {
				result += chunk.outro;
			}

			if (containsEnd) {
				break;
			}

			chunk = chunk.next;
		}

		return result;
	}

	// TODO deprecate this? not really very useful
	snip(start, end) {
		const clone = this.clone();
		clone.remove(0, start);
		clone.remove(end, clone.original.length);

		return clone;
	}

	_split(index) {
		if (this.byStart[index] || this.byEnd[index]) return;

		let chunk = this.lastSearchedChunk;
		const searchForward = index > chunk.end;

		while (chunk) {
			if (chunk.contains(index)) return this._splitChunk(chunk, index);

			chunk = searchForward ? this.byStart[chunk.end] : this.byEnd[chunk.start];
		}
	}

	_splitChunk(chunk, index) {
		if (chunk.edited && chunk.content.length) {
			// zero-length edited chunks are a special case (overlapping replacements)
			const loc = getLocator(this.original)(index);
			throw new Error(
				`Cannot split a chunk that has already been edited (${loc.line}:${loc.column} – "${chunk.original}")`,
			);
		}

		const newChunk = chunk.split(index);

		this.byEnd[index] = chunk;
		this.byStart[index] = newChunk;
		this.byEnd[newChunk.end] = newChunk;

		if (chunk === this.lastChunk) this.lastChunk = newChunk;

		this.lastSearchedChunk = chunk;
		return true;
	}

	toString() {
		let str = this.intro;

		let chunk = this.firstChunk;
		while (chunk) {
			str += chunk.toString();
			chunk = chunk.next;
		}

		return str + this.outro;
	}

	isEmpty() {
		let chunk = this.firstChunk;
		do {
			if (
				(chunk.intro.length && chunk.intro.trim()) ||
				(chunk.content.length && chunk.content.trim()) ||
				(chunk.outro.length && chunk.outro.trim())
			)
				return false;
		} while ((chunk = chunk.next));
		return true;
	}

	length() {
		let chunk = this.firstChunk;
		let length = 0;
		do {
			length += chunk.intro.length + chunk.content.length + chunk.outro.length;
		} while ((chunk = chunk.next));
		return length;
	}

	trimLines() {
		return this.trim('[\\r\\n]');
	}

	trim(charType) {
		return this.trimStart(charType).trimEnd(charType);
	}

	trimEndAborted(charType) {
		const rx = new RegExp((charType || '\\s') + '+$');

		this.outro = this.outro.replace(rx, '');
		if (this.outro.length) return true;

		let chunk = this.lastChunk;

		do {
			const end = chunk.end;
			const aborted = chunk.trimEnd(rx);

			// if chunk was trimmed, we have a new lastChunk
			if (chunk.end !== end) {
				if (this.lastChunk === chunk) {
					this.lastChunk = chunk.next;
				}

				this.byEnd[chunk.end] = chunk;
				this.byStart[chunk.next.start] = chunk.next;
				this.byEnd[chunk.next.end] = chunk.next;
			}

			if (aborted) return true;
			chunk = chunk.previous;
		} while (chunk);

		return false;
	}

	trimEnd(charType) {
		this.trimEndAborted(charType);
		return this;
	}
	trimStartAborted(charType) {
		const rx = new RegExp('^' + (charType || '\\s') + '+');

		this.intro = this.intro.replace(rx, '');
		if (this.intro.length) return true;

		let chunk = this.firstChunk;

		do {
			const end = chunk.end;
			const aborted = chunk.trimStart(rx);

			if (chunk.end !== end) {
				// special case...
				if (chunk === this.lastChunk) this.lastChunk = chunk.next;

				this.byEnd[chunk.end] = chunk;
				this.byStart[chunk.next.start] = chunk.next;
				this.byEnd[chunk.next.end] = chunk.next;
			}

			if (aborted) return true;
			chunk = chunk.next;
		} while (chunk);

		return false;
	}

	trimStart(charType) {
		this.trimStartAborted(charType);
		return this;
	}

	hasChanged() {
		return this.original !== this.toString();
	}

	_replaceRegexp(searchValue, replacement) {
		function getReplacement(match, str) {
			if (typeof replacement === 'string') {
				return replacement.replace(/\$(\$|&|\d+)/g, (_, i) => {
					// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_a_parameter
					if (i === '$') return '$';
					if (i === '&') return match[0];
					const num = +i;
					if (num < match.length) return match[+i];
					return `$${i}`;
				});
			} else {
				return replacement(...match, match.index, str, match.groups);
			}
		}
		function matchAll(re, str) {
			let match;
			const matches = [];
			while ((match = re.exec(str))) {
				matches.push(match);
			}
			return matches;
		}
		if (searchValue.global) {
			const matches = matchAll(searchValue, this.original);
			matches.forEach((match) => {
				if (match.index != null) {
					const replacement = getReplacement(match, this.original);
					if (replacement !== match[0]) {
						this.overwrite(match.index, match.index + match[0].length, replacement);
					}
				}
			});
		} else {
			const match = this.original.match(searchValue);
			if (match && match.index != null) {
				const replacement = getReplacement(match, this.original);
				if (replacement !== match[0]) {
					this.overwrite(match.index, match.index + match[0].length, replacement);
				}
			}
		}
		return this;
	}

	_replaceString(string, replacement) {
		const { original } = this;
		const index = original.indexOf(string);

		if (index !== -1) {
			this.overwrite(index, index + string.length, replacement);
		}

		return this;
	}

	replace(searchValue, replacement) {
		if (typeof searchValue === 'string') {
			return this._replaceString(searchValue, replacement);
		}

		return this._replaceRegexp(searchValue, replacement);
	}

	_replaceAllString(string, replacement) {
		const { original } = this;
		const stringLength = string.length;
		for (
			let index = original.indexOf(string);
			index !== -1;
			index = original.indexOf(string, index + stringLength)
		) {
			const previous = original.slice(index, index + stringLength);
			if (previous !== replacement) this.overwrite(index, index + stringLength, replacement);
		}

		return this;
	}

	replaceAll(searchValue, replacement) {
		if (typeof searchValue === 'string') {
			return this._replaceAllString(searchValue, replacement);
		}

		if (!searchValue.global) {
			throw new TypeError(
				'MagicString.prototype.replaceAll called with a non-global RegExp argument',
			);
		}

		return this._replaceRegexp(searchValue, replacement);
	}
}

/**@target web */
// index.ts for more details on contents and license of this file
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/utils.ts#L1302
function evalValue(rawValue) {
    const fn = new Function(`
        var console, exports, global, module, process, require
        return (\n${rawValue}\n)
      `);
    return fn();
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/shared/utils.ts#L31-L34
const postfixRE = /[?#].*$/;
function cleanUrl(url) {
    return url.replace(postfixRE, '');
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/utils.ts#L393
function tryStatSync(file) {
    try {
        // The "throwIfNoEntry" is a performance optimization for cases where the file does not exist
        return fs.statSync(file, { throwIfNoEntry: false });
    }
    catch {
    }
    return;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/utils.ts#L1030
function getHash(text, length = 8) {
    const h = createHash('sha256').update(text).digest('hex').substring(0, length);
    if (length <= 64) {
        return h;
    }
    return h.padEnd(length, '_');
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/shared/utils.ts#L40
function withTrailingSlash(path) {
    if (path[path.length - 1] !== '/') {
        return `${path}/`;
    }
    return path;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/utils.ts#L1268
function joinUrlSegments(a, b) {
    if (!a || !b) {
        return a || b || '';
    }
    if (a[a.length - 1] === '/') {
        a = a.substring(0, a.length - 1);
    }
    if (b[0] !== '/') {
        b = `/${b}`;
    }
    return a + b;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/utils.ts#L1281
function removeLeadingSlash(str) {
    return str[0] === '/' ? str.slice(1) : str;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/utils.ts#L319
function injectQuery(builtUrl, query) {
    const queryIndex = builtUrl.indexOf('?');
    return builtUrl + (queryIndex === -1 ? '?' : '&') + query;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/utils.ts#L1435
function partialEncodeURIPath(uri) {
    if (uri.startsWith('data:')) {
        return uri;
    }
    const filePath = cleanUrl(uri);
    const postfix = filePath !== uri ? uri.slice(filePath.length) : '';
    return filePath.replaceAll('%', '%25') + postfix;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/utils.ts#L1424
function encodeURIPath(uri) {
    if (uri.startsWith('data:')) {
        return uri;
    }
    const filePath = cleanUrl(uri);
    const postfix = filePath !== uri ? uri.slice(filePath.length) : '';
    return encodeURI(filePath) + postfix;
}

/**@target web */
const FS_PREFIX = '/@fs/';
async function fileToUrl(id, config) {
    let rtn;
    if (id.startsWith(withTrailingSlash(config.root))) {
        // in project root, infer short public path
        rtn = `/${path.posix.relative(config.root, id)}`;
    }
    else {
        // outside of project root, use absolute fs path
        // (this is special handled by the serve static middleware
        rtn = path.posix.join(FS_PREFIX, id);
    }
    const base = joinUrlSegments(config.server?.origin ?? '', config.base);
    return joinUrlSegments(base, removeLeadingSlash(rtn));
}

/**@target web */
// index.ts for more details on contents and license of this file
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/constants.ts#L143
const METADATA_FILENAME = '_metadata.json';
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/constants.ts#L63
const ENV_PUBLIC_PATH = '/@vite/env';
// https://github.com/vitejs/vite/blob/v6.1.1/packages/vite/src/node/constants.ts#L10C1-L38C32
const ROLLUP_HOOKS = [
    'options',
    'buildStart',
    'buildEnd',
    'renderStart',
    'renderError',
    'renderChunk',
    'writeBundle',
    'generateBundle',
    'banner',
    'footer',
    'augmentChunkHash',
    'outputOptions',
    'renderDynamicImport',
    'resolveFileUrl',
    'resolveImportMeta',
    'intro',
    'outro',
    'closeBundle',
    'closeWatcher',
    'load',
    'moduleParsed',
    'watchChange',
    'resolveDynamicImport',
    'resolveId',
    'shouldTransformCachedModule',
    'transform',
    'onLog'
];

/**@target web */
// https://github.com/vitejs/vite/blob/v6.1.1/packages/vite/src/node/plugins/index.ts#L161
// biome-ignore lint/complexity/noBannedTypes: Function type needed here
function getHookHandler(hook) {
    return (typeof hook === 'object' ? hook.handler : hook);
}

/**@target web */
const needsEscapeRegEx = /[\n\r'\\\u2028\u2029]/;
const quoteNewlineRegEx = /([\n\r'\u2028\u2029])/g;
const backSlashRegEx = /\\/g;
function escapeId(id) {
    if (!needsEscapeRegEx.test(id)) {
        return id;
    }
    return id.replace(backSlashRegEx, '\\\\').replace(quoteNewlineRegEx, '\\$1');
}
const getResolveUrl = (path, URL = 'URL') => `new ${URL}(${path}).href`;
const getRelativeUrlFromDocument = (relativePath, umd = false) => getResolveUrl(`'${escapeId(partialEncodeURIPath(relativePath))}', ${umd ? `typeof document === 'undefined' ? location.href : ` : ''}document.currentScript && document.currentScript.src || document.baseURI`);
const getFileUrlFromFullPath = (path) => `require('u' + 'rl').pathToFileURL(${path}).href`;
const getFileUrlFromRelativePath = (path) => getFileUrlFromFullPath(`__dirname + '/${escapeId(path)}'`);
const relativeUrlMechanisms = {
    amd: relativePath => {
        if (relativePath[0] !== '.') {
            relativePath = `./${relativePath}`;
        }
        return getResolveUrl(`require.toUrl('${escapeId(relativePath)}'), document.baseURI`);
    },
    cjs: relativePath => `(typeof document === 'undefined' ? ${getFileUrlFromRelativePath(relativePath)} : ${getRelativeUrlFromDocument(relativePath)})`,
    es: relativePath => getResolveUrl(`'${escapeId(partialEncodeURIPath(relativePath))}', import.meta.url`),
    iife: relativePath => getRelativeUrlFromDocument(relativePath),
    // NOTE: make sure rollup generate `module` params
    system: relativePath => getResolveUrl(`'${escapeId(partialEncodeURIPath(relativePath))}', module.meta.url`),
    umd: relativePath => `(typeof document === 'undefined' && typeof location === 'undefined' ? ${getFileUrlFromRelativePath(relativePath)} : ${getRelativeUrlFromDocument(relativePath, true)})`
};
const customRelativeUrlMechanisms = {
    ...relativeUrlMechanisms,
    'worker-iife': relativePath => getResolveUrl(`'${escapeId(partialEncodeURIPath(relativePath))}', self.location.href`)
};
function createToImportMetaURLBasedRelativeRuntime(format, isWorker) {
    const formatLong = isWorker && format === 'iife' ? 'worker-iife' : format;
    const toRelativePath = customRelativeUrlMechanisms[formatLong];
    return (filename, importer) => ({
        runtime: toRelativePath(path.posix.relative(path.dirname(importer), filename))
    });
}
function toOutputFilePathInJS(filename, type, hostId, hostType, config, toRelative) {
    const { renderBuiltUrl } = config.experimental;
    let relative = config.base === '' || config.base === '@src/vite/bridge/';
    if (renderBuiltUrl) {
        const result = renderBuiltUrl(filename, {
            hostId,
            hostType,
            type,
            ssr: !!config.build.ssr
        });
        if (typeof result === 'object') {
            if (result.runtime) {
                return { runtime: result.runtime };
            }
            if (typeof result.relative === 'boolean') {
                relative = result.relative;
            }
        }
        else if (result) {
            return result;
        }
    }
    if (relative && !config.build.ssr) {
        return toRelative(filename, hostId);
    }
    return joinUrlSegments(config.base, filename);
}
// https://github.com/vitejs/vite/blob/v6.1.1/packages/vite/src/node/build.ts#L1131
function injectEnvironmentToHooks(environment, plugin) {
    const { resolveId, load, transform } = plugin;
    const clone = { ...plugin };
    for (const hook of Object.keys(clone)) {
        switch (hook) {
            case 'resolveId':
                clone[hook] = wrapEnvironmentResolveId(environment, resolveId);
                break;
            case 'load':
                clone[hook] = wrapEnvironmentLoad(environment, load);
                break;
            case 'transform':
                clone[hook] = wrapEnvironmentTransform(environment, transform);
                break;
            default:
                if (ROLLUP_HOOKS.includes(hook)) {
                    clone[hook] = wrapEnvironmentHook(environment, clone[hook]);
                }
                break;
        }
    }
    return clone;
}
function wrapEnvironmentResolveId(environment, hook) {
    if (!hook) {
        return;
    }
    const fn = getHookHandler(hook);
    const handler = function (id, importer, options) {
        return fn.call(injectEnvironmentInContext(this, environment), id, importer, injectSsrFlag(options, environment));
    };
    if ('handler' in hook) {
        return {
            ...hook,
            handler
        };
    }
    return handler;
}
function wrapEnvironmentLoad(environment, hook) {
    if (!hook) {
        return;
    }
    const fn = getHookHandler(hook);
    const handler = function (id, ...args) {
        return fn.call(injectEnvironmentInContext(this, environment), id, injectSsrFlag(args[0], environment));
    };
    if ('handler' in hook) {
        return {
            ...hook,
            handler
        };
    }
    return handler;
}
function wrapEnvironmentTransform(environment, hook) {
    if (!hook) {
        return;
    }
    const fn = getHookHandler(hook);
    const handler = function (code, importer, ...args) {
        return fn.call(injectEnvironmentInContext(this, environment), code, importer, injectSsrFlag(args[0], environment));
    };
    if ('handler' in hook) {
        return {
            ...hook,
            handler
        };
    }
    return handler;
}
function wrapEnvironmentHook(environment, hook) {
    if (!hook) {
        return;
    }
    const fn = getHookHandler(hook);
    if (typeof fn !== 'function') {
        return hook;
    }
    const handler = function (...args) {
        return fn.call(injectEnvironmentInContext(this, environment), ...args);
    };
    if ('handler' in hook) {
        return {
            ...hook,
            handler
        };
    }
    return handler;
}
function injectEnvironmentInContext(context, environment) {
    context.environment ?? (context.environment = environment);
    return context;
}
function injectSsrFlag(options, environment) {
    const ssr = environment ? environment.config.consumer === 'server' : true;
    return { ...(options ?? {}), ssr };
}

/**@target web */
// index.ts for more details on contents and license of this file
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/fsUtils.ts#L388
function tryResolveRealFile(file, preserveSymlinks) {
    const fileStat = tryStatSync(file);
    if (fileStat?.isFile()) {
        return file;
    }
    if (fileStat?.isSymbolicLink()) {
        return preserveSymlinks ? file : fs.realpathSync(file);
    }
    return undefined;
}

/**@target web */
// index.ts for more details on contents and license of this file
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/plugins/resolve.ts#L534
function splitFileAndPostfix(path) {
    const file = cleanUrl(path);
    return { file, postfix: path.slice(file.length) };
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/plugins/resolve.ts#L566-L574
function tryFsResolve(fsPath, preserveSymlinks) {
    const { file, postfix } = splitFileAndPostfix(fsPath);
    const res = tryCleanFsResolve(file, preserveSymlinks);
    if (res) {
        return res + postfix;
    }
    return;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/plugins/resolve.ts#L580
function tryCleanFsResolve(file, preserveSymlinks) {
    if (file.includes('node_modules')) {
        return tryResolveRealFile(file, preserveSymlinks);
    }
    const normalizedResolved = tryResolveRealFile(normalizePath(file));
    if (!normalizedResolved) {
        return tryResolveRealFile(file, preserveSymlinks);
    }
    return normalizedResolved;
}

/**@target web */
// index.ts for more details on contents and license of this file
// https://github.com/Danielku15/vite/blob/88b7def341f12d07d7d4f83cbe3dc73cc8c6b7be/packages/vite/src/node/optimizer/index.ts#L1356
function tryOptimizedDepResolve(config, ssr, url, depId, preserveSymlinks) {
    const optimizer = getDepsOptimizer(config, ssr);
    if (optimizer?.isOptimizedDepFile(depId)) {
        const depFile = cleanUrl(depId);
        const info = optimizedDepInfoFromFile(optimizer.metadata, depFile);
        const depSrc = info?.src;
        if (depSrc) {
            const resolvedFile = path.resolve(path.dirname(depSrc), url);
            return tryFsResolve(resolvedFile, preserveSymlinks);
        }
    }
    return undefined;
}
// https://github.com/Danielku15/vite/blob/88b7def341f12d07d7d4f83cbe3dc73cc8c6b7be/packages/vite/src/node/optimizer/optimizer.ts#L32-L40
const depsOptimizerMap = new WeakMap();
const devSsrDepsOptimizerMap = new WeakMap();
function getDepsOptimizer(config, ssr) {
    const map = ssr ? devSsrDepsOptimizerMap : depsOptimizerMap;
    let optimizer = map.get(config);
    if (!optimizer) {
        optimizer = createDepsOptimizer(config);
        map.set(config, optimizer);
    }
    return optimizer;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/optimizer/optimizer.ts#L79
function createDepsOptimizer(config) {
    const depsCacheDirPrefix = normalizePath(path.resolve(config.cacheDir, 'deps'));
    const metadata = parseDepsOptimizerMetadata(fs.readFileSync(path.join(depsCacheDirPrefix, METADATA_FILENAME), 'utf8'), depsCacheDirPrefix);
    const notImplemented = () => {
        throw new Error('not implemented');
    };
    const depsOptimizer = {
        async init() {
        },
        metadata,
        registerMissingImport: notImplemented,
        run: notImplemented,
        // https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/optimizer/index.ts#L916
        isOptimizedDepFile: id => id.startsWith(depsCacheDirPrefix),
        isOptimizedDepUrl: notImplemented,
        getOptimizedDepId: notImplemented,
        close: notImplemented,
        options: {}
    };
    return depsOptimizer;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/optimizer/index.ts#L944
function parseDepsOptimizerMetadata(jsonMetadata, depsCacheDir) {
    const { hash, lockfileHash, configHash, browserHash, optimized, chunks } = JSON.parse(jsonMetadata, (key, value) => {
        if (key === 'file' || key === 'src') {
            return normalizePath(path.resolve(depsCacheDir, value));
        }
        return value;
    });
    if (!chunks || Object.values(optimized).some(depInfo => !depInfo.fileHash)) {
        // outdated _metadata.json version, ignore
        return;
    }
    const metadata = {
        hash,
        lockfileHash,
        configHash,
        browserHash,
        optimized: {},
        discovered: {},
        chunks: {},
        depInfoList: []
    };
    for (const id of Object.keys(optimized)) {
        addOptimizedDepInfo(metadata, 'optimized', {
            ...optimized[id],
            id,
            browserHash
        });
    }
    for (const id of Object.keys(chunks)) {
        addOptimizedDepInfo(metadata, 'chunks', {
            ...chunks[id],
            id,
            browserHash,
            needsInterop: false
        });
    }
    return metadata;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/optimizer/index.ts#L322
function addOptimizedDepInfo(metadata, type, depInfo) {
    metadata[type][depInfo.id] = depInfo;
    metadata.depInfoList.push(depInfo);
    return depInfo;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/optimizer/index.ts#L1248
function optimizedDepInfoFromFile(metadata, file) {
    return metadata.depInfoList.find(depInfo => depInfo.file === file);
}

/**@target web */
// biome-ignore lint/suspicious/noConstEnum: Exception where we use them
var AlphaTabWorkerTypes;
(function (AlphaTabWorkerTypes) {
    AlphaTabWorkerTypes["WorkerClassic"] = "worker_classic";
    AlphaTabWorkerTypes["WorkerModule"] = "worker_module";
    AlphaTabWorkerTypes["AudioWorklet"] = "audio_worklet";
})(AlphaTabWorkerTypes || (AlphaTabWorkerTypes = {}));
const workerCache = new WeakMap();
const WORKER_FILE_ID = 'alphatab_worker';
const WORKER_ASSET_ID = '__ALPHATAB_WORKER_ASSET__';
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/plugins/worker.ts#L47
function saveEmitWorkerAsset(config, asset) {
    const workerMap = workerCache.get(config.mainConfig || config);
    workerMap.assets.set(asset.fileName, asset);
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/plugins/worker.ts#L161
async function workerFileToUrl(config, id) {
    const workerMap = workerCache.get(config.mainConfig || config);
    let fileName = workerMap.bundle.get(id);
    if (!fileName) {
        const outputChunk = await bundleWorkerEntry(config, id);
        fileName = outputChunk.fileName;
        saveEmitWorkerAsset(config, {
            fileName,
            source: outputChunk.code
        });
        workerMap.bundle.set(id, fileName);
    }
    return encodeWorkerAssetFileName(fileName, workerMap);
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/plugins/worker.ts#L149
function encodeWorkerAssetFileName(fileName, workerCache) {
    const { fileNameHash } = workerCache;
    const hash = getHash(fileName);
    if (!fileNameHash.get(hash)) {
        fileNameHash.set(hash, fileName);
    }
    return `${WORKER_ASSET_ID}${hash}__`;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/plugins/worker.ts#L55
async function bundleWorkerEntry(config, id) {
    const input = cleanUrl(id);
    const bundleChain = config.bundleChain ?? [];
    const newBundleChain = [...bundleChain, input];
    if (bundleChain.includes(input)) {
        throw new Error(`Circular worker imports detected. Vite does not support it. Import chain: ${newBundleChain.join(' -> ')}`);
    }
    // bundle the file as entry to support imports
    const { rollup } = await import('rollup');
    const { plugins, rollupOptions, format } = config.worker;
    const workerConfig = await plugins(newBundleChain);
    const workerEnvironment = new BuildEnvironment('client', workerConfig); // TODO: should this be 'worker'?
    await workerEnvironment.init();
    const bundle = await rollup({
        ...rollupOptions,
        input,
        plugins: workerEnvironment.plugins.map(p => injectEnvironmentToHooks(workerEnvironment, p)),
        preserveEntrySignatures: false
    });
    let chunk;
    try {
        const workerOutputConfig = config.worker.rollupOptions.output;
        const workerConfig = workerOutputConfig
            ? Array.isArray(workerOutputConfig)
                ? workerOutputConfig[0] || {}
                : workerOutputConfig
            : {};
        const { output: [outputChunk, ...outputChunks] } = await bundle.generate({
            entryFileNames: path.posix.join(config.build.assetsDir, '[name]-[hash].js'),
            chunkFileNames: path.posix.join(config.build.assetsDir, '[name]-[hash].js'),
            assetFileNames: path.posix.join(config.build.assetsDir, '[name]-[hash].[ext]'),
            ...workerConfig,
            format,
            sourcemap: config.build.sourcemap
        });
        chunk = outputChunk;
        for (const outputChunk of outputChunks) {
            if (outputChunk.type === 'asset') {
                saveEmitWorkerAsset(config, outputChunk);
            }
            else if (outputChunk.type === 'chunk') {
                saveEmitWorkerAsset(config, {
                    fileName: outputChunk.fileName,
                    source: outputChunk.code
                });
            }
        }
    }
    finally {
        await bundle.close();
    }
    return emitSourcemapForWorkerEntry(config, chunk);
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/plugins/worker.ts#L124
function emitSourcemapForWorkerEntry(config, chunk) {
    const { map: sourcemap } = chunk;
    if (sourcemap) {
        if (config.build.sourcemap === 'hidden' || config.build.sourcemap === true) {
            const data = sourcemap.toString();
            const mapFileName = `${chunk.fileName}.map`;
            saveEmitWorkerAsset(config, {
                fileName: mapFileName,
                source: data
            });
        }
    }
    return chunk;
}
// https://github.com/vitejs/vite/blob/b7ddfae5f852c2948fab03e94751ce56f5f31ce0/packages/vite/src/node/plugins/worker.ts#L458
function isSameContent(a, b) {
    if (typeof a === 'string') {
        if (typeof b === 'string') {
            return a === b;
        }
        return Buffer.from(a).equals(b);
    }
    return Buffer.from(b).equals(a);
}

/**@target web */
const alphaTabWorkerPatterns = [
    ['alphaTabWorker', 'new', 'alphaTabUrl', 'import.meta.url'],
    ['alphaTabWorklet.addModule', 'new', 'alphaTabUrl', 'import.meta.url']
];
function includesAlphaTabWorker(code) {
    for (const pattern of alphaTabWorkerPatterns) {
        let position = 0;
        for (const match of pattern) {
            position = code.indexOf(match, position);
            if (position === -1) {
                break;
            }
        }
        if (position !== -1) {
            return true;
        }
    }
    return false;
}
function getWorkerType(code, match) {
    if (match[1].includes('.addModule')) {
        return AlphaTabWorkerTypes.AudioWorklet;
    }
    const endOfMatch = match.indices[0][1];
    const startOfOptions = code.indexOf('{', endOfMatch);
    if (startOfOptions === -1) {
        return AlphaTabWorkerTypes.WorkerClassic;
    }
    const endOfOptions = code.indexOf('}', endOfMatch);
    if (endOfOptions === -1) {
        return AlphaTabWorkerTypes.WorkerClassic;
    }
    const endOfWorkerCreate = code.indexOf(')', endOfMatch);
    if (startOfOptions > endOfWorkerCreate || endOfOptions > endOfWorkerCreate) {
        return AlphaTabWorkerTypes.WorkerClassic;
    }
    let workerOptions = code.slice(startOfOptions, endOfOptions + 1);
    try {
        workerOptions = evalValue(workerOptions);
    }
    catch (e) {
        return AlphaTabWorkerTypes.WorkerClassic;
    }
    if (typeof workerOptions === 'object' && workerOptions?.type === 'module') {
        return AlphaTabWorkerTypes.WorkerModule;
    }
    return AlphaTabWorkerTypes.WorkerClassic;
}
function importMetaUrlPlugin(options) {
    let resolvedConfig;
    let isBuild;
    let preserveSymlinks;
    const isWorkerActive = options.webWorkers !== false;
    const isWorkletActive = options.audioWorklets !== false;
    const isActive = isWorkerActive || isWorkletActive;
    return {
        name: 'vite-plugin-alphatab-url',
        enforce: 'pre',
        configResolved(config) {
            resolvedConfig = config;
            isBuild = config.command === 'build';
            preserveSymlinks = config.resolve.preserveSymlinks;
        },
        shouldTransformCachedModule({ code }) {
            if (isActive && isBuild && resolvedConfig.build.watch && includesAlphaTabWorker(code)) {
                return true;
            }
            return;
        },
        async transform(code, id, options) {
            if (!isActive || options?.ssr || !includesAlphaTabWorker(code)) {
                return;
            }
            let s;
            const alphaTabWorkerPattern = 
            // @ts-expect-error For the Vite plugin we expect newer node than for alphaTab itself (-> migrate to monorepo)
            /\b(alphaTabWorker|alphaTabWorklet\.addModule)\s*\(\s*(new\s+[^ (]+alphaTabUrl\s*\(\s*(\'[^\']+\'|"[^"]+"|`[^`]+`)\s*,\s*import\.meta\.url\s*\))/dg;
            let match = alphaTabWorkerPattern.exec(code);
            while (match) {
                const workerType = getWorkerType(code, match);
                let typeActive = false;
                switch (workerType) {
                    case AlphaTabWorkerTypes.WorkerClassic:
                    case AlphaTabWorkerTypes.WorkerModule:
                        typeActive = isWorkerActive;
                        break;
                    case AlphaTabWorkerTypes.AudioWorklet:
                        typeActive = isWorkletActive;
                        break;
                }
                if (!typeActive) {
                    match = alphaTabWorkerPattern.exec(code);
                    continue;
                }
                s ?? (s = new MagicString(code));
                const url = code.slice(match.indices[3][0] + 1, match.indices[3][1] - 1);
                let file = path__default.resolve(path__default.dirname(id), url);
                file =
                    tryFsResolve(file, preserveSymlinks) ??
                        tryOptimizedDepResolve(resolvedConfig, options?.ssr === true, url, id, preserveSymlinks) ??
                        file;
                let builtUrl;
                if (isBuild) {
                    builtUrl = await workerFileToUrl(resolvedConfig, file);
                }
                else {
                    builtUrl = await fileToUrl(cleanUrl(file), resolvedConfig);
                    builtUrl = injectQuery(builtUrl, `${WORKER_FILE_ID}&type=${workerType}`);
                }
                s.update(match.indices[3][0], match.indices[3][1], 
                // add `'' +` to skip vite:asset-import-meta-url plugin
                `new URL('' + ${JSON.stringify(builtUrl)}, import.meta.url)`);
                match = alphaTabWorkerPattern.exec(code);
            }
            if (s) {
                return {
                    code: s.toString(),
                    map: resolvedConfig.command === 'build' && resolvedConfig.build.sourcemap
                        ? s.generateMap({ hires: 'boundary', source: id })
                        : null
                };
            }
            return null;
        }
    };
}

/**@target web */
function copyAssetsPlugin(options) {
    let resolvedConfig;
    let output = false;
    return {
        name: 'vite-plugin-alphatab-copy',
        enforce: 'pre',
        configResolved(config) {
            resolvedConfig = config;
        },
        buildEnd() {
            // reset for watch mode
            output = false;
        },
        async buildStart() {
            // run copy only once even if multiple bundles are generated
            if (output) {
                return;
            }
            output = true;
            let alphaTabSourceDir = options.alphaTabSourceDir;
            if (!alphaTabSourceDir) {
                try {
                    const isEsm = typeof import.meta.url === 'string';
                    if (isEsm) {
                        alphaTabSourceDir = url.fileURLToPath(import.meta.resolve('@coderline/alphatab'));
                    }
                    else {
                        alphaTabSourceDir = require.resolve('@coderline/alphatab');
                    }
                    alphaTabSourceDir = path.resolve(alphaTabSourceDir, '..');
                }
                catch (e) {
                    alphaTabSourceDir = path.join(resolvedConfig.root, 'node_modules/@coderline/alphatab/dist/');
                }
            }
            let isValidAlphaTabSourceDir;
            if (alphaTabSourceDir) {
                try {
                    await fs.promises.access(path.join(alphaTabSourceDir, 'alphaTab.mjs'), fs.constants.F_OK);
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
                resolvedConfig.logger.error('Could not find alphaTab, please ensure it is installed into node_modules or configure alphaTabSourceDir');
                return;
            }
            const outputPath = (options.assetOutputDir ?? resolvedConfig.publicDir);
            if (!outputPath) {
                return;
            }
            async function copyFiles(subdir) {
                const fullDir = path.join(alphaTabSourceDir, subdir);
                const files = await fs.promises.readdir(fullDir, {
                    withFileTypes: true
                });
                await fs.promises.mkdir(path.join(outputPath, subdir), {
                    recursive: true
                });
                await Promise.all(files
                    .filter(f => f.isFile())
                    .map(async (file) => {
                    // node v20.12.0 has parentPath pointing to the path (not the file)
                    // see https://github.com/nodejs/node/pull/50976
                    const sourceFilename = path.join(file.parentPath ?? file.path, file.name);
                    await fs.promises.copyFile(sourceFilename, path.join(outputPath, subdir, file.name));
                }));
            }
            await Promise.all([copyFiles('font'), copyFiles('soundfont')]);
        }
    };
}

/**@target web */
const workerFileRE = new RegExp(`(?:\\?|&)${WORKER_FILE_ID}&type=(\\w+)(?:&|$)`);
const workerAssetUrlRE = new RegExp(`${WORKER_ASSET_ID}([a-z\\d]{8})__`, 'g');
function workerPlugin(options) {
    let resolvedConfig;
    let isBuild;
    let isWorker;
    const isWorkerActive = options.webWorkers !== false;
    const isWorkletActive = options.audioWorklets !== false;
    const isActive = isWorkerActive || isWorkletActive;
    return {
        name: 'vite-plugin-alphatab-worker',
        configResolved(config) {
            resolvedConfig = config;
            isBuild = config.command === 'build';
            isWorker = config.isWorker;
        },
        buildStart() {
            if (!isActive || isWorker) {
                return;
            }
            workerCache.set(resolvedConfig, {
                assets: new Map(),
                bundle: new Map(),
                fileNameHash: new Map()
            });
        },
        load(id) {
            if (isActive && isBuild && id.includes(WORKER_FILE_ID)) {
                return '';
            }
            return;
        },
        shouldTransformCachedModule({ id }) {
            if (isActive && isBuild && resolvedConfig.build.watch && id.includes(WORKER_FILE_ID)) {
                return true;
            }
            return;
        },
        async transform(raw, id) {
            if (!isActive) {
                return;
            }
            const match = workerFileRE.exec(id);
            if (!match) {
                return;
            }
            // inject env to worker file, might be needed by imported scripts
            const envScriptPath = JSON.stringify(path.posix.join(resolvedConfig.base, ENV_PUBLIC_PATH));
            const workerType = match[1];
            let injectEnv = '';
            switch (workerType) {
                case AlphaTabWorkerTypes.WorkerClassic:
                    injectEnv = `importScripts(${envScriptPath})\n`;
                    break;
                case AlphaTabWorkerTypes.WorkerModule:
                case AlphaTabWorkerTypes.AudioWorklet:
                    injectEnv = `import ${envScriptPath}\n`;
                    break;
            }
            if (injectEnv) {
                const s = new MagicString(raw);
                s.prepend(injectEnv);
                return {
                    code: s.toString(),
                    map: s.generateMap({ hires: 'boundary' })
                };
            }
            return;
        },
        renderChunk(code, chunk, outputOptions) {
            // when building the worker URLs are replaced with some placeholders
            // here we replace those placeholders with the final file names respecting chunks
            let s;
            const result = () => {
                return (s && {
                    code: s.toString(),
                    map: resolvedConfig.build.sourcemap ? s.generateMap({ hires: 'boundary' }) : null
                });
            };
            workerAssetUrlRE.lastIndex = 0;
            if (workerAssetUrlRE.test(code)) {
                const toRelativeRuntime = createToImportMetaURLBasedRelativeRuntime(outputOptions.format, resolvedConfig.isWorker);
                s = new MagicString(code);
                workerAssetUrlRE.lastIndex = 0;
                // Replace "/" using relative paths
                const workerMap = workerCache.get(resolvedConfig.mainConfig || resolvedConfig);
                const { fileNameHash } = workerMap;
                let match = workerAssetUrlRE.exec(code);
                while (match) {
                    const [full, hash] = match;
                    const filename = fileNameHash.get(hash);
                    const replacement = toOutputFilePathInJS(filename, 'asset', chunk.fileName, 'js', resolvedConfig, toRelativeRuntime);
                    const replacementString = typeof replacement === 'string'
                        ? JSON.stringify(encodeURIPath(replacement)).slice(1, -1)
                        : `"+${replacement.runtime}+"`;
                    s.update(match.index, match.index + full.length, replacementString);
                    match = workerAssetUrlRE.exec(code);
                }
            }
            return result();
        },
        generateBundle(_, bundle) {
            if (isWorker) {
                return;
            }
            const workerMap = workerCache.get(resolvedConfig);
            for (const asset of workerMap.assets.values()) {
                const duplicateAsset = bundle[asset.fileName];
                if (duplicateAsset) {
                    const content = duplicateAsset.type === 'asset' ? duplicateAsset.source : duplicateAsset.code;
                    // don't emit if the file name and the content is same
                    if (isSameContent(content, asset.source)) {
                        return;
                    }
                }
                this.emitFile({
                    type: 'asset',
                    fileName: asset.fileName,
                    source: asset.source
                });
            }
            workerMap.assets.clear();
        }
    };
}

/**@target web */
function alphaTab(options) {
    const plugins = [];
    options ?? (options = {});
    plugins.push(importMetaUrlPlugin(options));
    plugins.push(workerPlugin(options));
    plugins.push(copyAssetsPlugin(options));
    return plugins;
}

export { alphaTab };
