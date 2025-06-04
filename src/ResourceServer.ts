import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';

export class ResourceServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private pluginDir: string;

    constructor(pluginDir: string) {
        // 修复：确保使用正确的绝对路径
        this.pluginDir = path.resolve(pluginDir);
        console.log(`[AlphaTab Debug] ResourceServer initialized with directory: ${this.pluginDir}`);
        
        // 验证插件目录是否存在
        if (!fs.existsSync(this.pluginDir)) {
            console.error(`[AlphaTab Debug] Warning: Plugin directory does not exist: ${this.pluginDir}`);
        } else {
            console.log(`[AlphaTab Debug] Plugin directory verified: ${this.pluginDir}`);
            // 列出目录内容以便调试
            const contents = fs.readdirSync(this.pluginDir);
            console.log(`[AlphaTab Debug] Plugin directory contents:`, contents);
            
            // 特别检查 assets 目录
            const assetsDir = path.join(this.pluginDir, 'assets');
            if (fs.existsSync(assetsDir)) {
                console.log(`[AlphaTab Debug] Assets directory exists: ${assetsDir}`);
                const assetsContents = fs.readdirSync(assetsDir);
                console.log(`[AlphaTab Debug] Assets contents:`, assetsContents);
                
                // 检查 alphatab 目录
                const alphatabDir = path.join(assetsDir, 'alphatab');
                if (fs.existsSync(alphatabDir)) {
                    console.log(`[AlphaTab Debug] AlphaTab directory exists: ${alphatabDir}`);
                    const alphatabContents = fs.readdirSync(alphatabDir);
                    console.log(`[AlphaTab Debug] AlphaTab contents:`, alphatabContents);
                    
                    // 检查 font 目录
                    const fontDir = path.join(alphatabDir, 'font');
                    if (fs.existsSync(fontDir)) {
                        console.log(`[AlphaTab Debug] Font directory exists: ${fontDir}`);
                        const fontContents = fs.readdirSync(fontDir);
                        console.log(`[AlphaTab Debug] Font files:`, fontContents);
                    } else {
                        console.warn(`[AlphaTab Debug] Font directory missing: ${fontDir}`);
                    }
                } else {
                    console.warn(`[AlphaTab Debug] AlphaTab directory missing: ${alphatabDir}`);
                }
            } else {
                console.warn(`[AlphaTab Debug] Assets directory missing: ${assetsDir}`);
            }
        }
    }

    async start(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            // 监听随机可用端口
            this.server.listen(0, 'localhost', () => {
                const address = this.server?.address();
                if (address && typeof address === 'object') {
                    this.port = address.port;
                    const baseUrl = `http://localhost:${this.port}`;
                    console.log(`[AlphaTab Debug] Resource server started at ${baseUrl}`);
                    resolve(baseUrl);
                } else {
                    reject(new Error('Failed to get server address'));
                }
            });

            this.server.on('error', (err) => {
                console.error('[AlphaTab Debug] Resource server error:', err);
                reject(err);
            });
        });
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            if (!req.url) {
                console.log('[AlphaTab Debug] Request rejected: no URL');
                res.writeHead(404);
                res.end('Not Found');
                return;
            }

            const urlPath = req.url.split('?')[0];
            // 修复：更好的路径处理
            const relativePath = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath;
            
            // 尝试常规路径
            let filePath = path.join(this.pluginDir, relativePath);

            // 新增：如果请求的是 alphatab 目录下的字体文件但没找到，自动去 font 子目录查找
            const isAlphaTabFontRoot = /^assets\/alphatab\/[^/]+\.(woff2?|otf|eot|svg)$/i.test(relativePath);
            if (isAlphaTabFontRoot && !fs.existsSync(filePath)) {
                // 例如 /assets/alphatab/Bravura.woff => /assets/alphatab/font/Bravura.woff
                const fontFilePath = path.join(this.pluginDir, "assets", "alphatab", "font", path.basename(relativePath));
                if (fs.existsSync(fontFilePath)) {
                    filePath = fontFilePath;
                    console.log(`[AlphaTab Debug] Fallback font path: ${fontFilePath}`);
                }
            }

            // 调试信息
            console.log(`[AlphaTab Debug] === Resource Request Debug ===`);
            console.log(`[AlphaTab Debug] Request URL: ${req.url}`);
            console.log(`[AlphaTab Debug] Plugin Dir: ${this.pluginDir}`);
            console.log(`[AlphaTab Debug] Requested File: ${filePath}`);
            console.log(`[AlphaTab Debug] File exists: ${fs.existsSync(filePath)}`);
            
            // 设置CORS头（所有响应都应设置）
            const setCORSHeaders = () => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            };

            // 处理OPTIONS预检请求
            if (req.method === 'OPTIONS') {
                setCORSHeaders();
                console.log(`[AlphaTab Debug] Handling OPTIONS request`);
                res.writeHead(200);
                res.end();
                return;
            }

            // 如果文件不存在，尝试备用路径
            let actualFilePath = filePath;
            if (!fs.existsSync(filePath)) {
                // 尝试硬编码的开发路径
                const alternativeFilePath = path.join(hardcodedPluginDir, relativePath);
                
                console.log(`[AlphaTab Debug] File not found, trying alternative path: ${alternativeFilePath}`);
                console.log(`[AlphaTab Debug] Alternative path exists: ${fs.existsSync(alternativeFilePath)}`);
                
                if (fs.existsSync(alternativeFilePath)) {
                    actualFilePath = alternativeFilePath;
                    // 只是为了这个请求临时使用正确的路径
                    console.log(`[AlphaTab Debug] Using alternative path for this request`);
                }
            }

            // 检查文件是否存在
            if (!fs.existsSync(actualFilePath)) {
                setCORSHeaders();
                console.warn(`[AlphaTab Debug] File not found after all attempts: ${actualFilePath}`);
                
                // 如果是字体请求，尝试查找匹配的文件
                if (relativePath.includes('font')) {
                    // 增强字体文件查找
                    const fontMatch = this.findMatchingFontFile(relativePath);
                    if (fontMatch) {
                        console.log(`[AlphaTab Debug] Found matching font file: ${fontMatch}`);
                        actualFilePath = fontMatch;
                    } else {
                        // 对于字体文件的优雅错误处理 - 返回较友好的响应码以防止过多错误
                        console.log(`[AlphaTab Debug] This is a font request that failed - returning empty font`);
                        const fontFileName = path.basename(relativePath);
                        if (fontFileName.endsWith('.woff') || fontFileName.endsWith('.woff2')) {
                            setCORSHeaders();
                            res.setHeader('Content-Type', fontFileName.endsWith('.woff2') ? 'font/woff2' : 'font/woff');
                            res.writeHead(200);
                            res.end(Buffer.from([0]));
                            return;
                        }
                        this.searchForFontFiles(this.pluginDir);
                        res.writeHead(404);
                        res.end('Font File Not Found');
                        return;
                    }
                } else {
                    setCORSHeaders();
                    res.writeHead(404);
                    res.end('Not Found');
                    return;
                }
            }

            const normalizedFilePath = path.resolve(actualFilePath);
            
            // 验证安全性 - 允许两个可能的插件目录
            const normalizedPluginDir = path.resolve(this.pluginDir);
            
            if (!normalizedFilePath.startsWith(normalizedPluginDir) && 
                !normalizedFilePath.startsWith(hardcodedDir)) {
                setCORSHeaders();
                console.warn(`[AlphaTab Debug] Security: Blocked access outside plugin directory`);
                console.warn(`[AlphaTab Debug] Requested path: ${normalizedFilePath}`);
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            const stat = fs.statSync(normalizedFilePath);
            if (stat.isDirectory()) {
                setCORSHeaders();
                console.log(`[AlphaTab Debug] Path is directory, not file: ${normalizedFilePath}`);
                res.writeHead(403);
                res.end('Directory listing not allowed');
                return;
            }

            // 设置正确的Content-Type
            let mimeType = mime.lookup(normalizedFilePath) || 'application/octet-stream';
            
            // 强制设置字体文件的正确 MIME 类型
            const ext = path.extname(normalizedFilePath).toLowerCase();
            switch (ext) {
                case '.woff':
                    mimeType = 'font/woff';
                    break;
                case '.woff2':
                    mimeType = 'font/woff2';
                    break;
                case '.eot':
                    mimeType = 'application/vnd.ms-fontobject';
                    break;
                case '.otf':
                    mimeType = 'font/otf';
                    break;
                case '.svg':
                    mimeType = 'image/svg+xml';
                    break;
                case '.mjs':
                    mimeType = 'application/javascript';
                    break;
            }

            console.log(`[AlphaTab Debug] Serving file: ${normalizedFilePath} (${mimeType})`);

            setCORSHeaders();
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', stat.size);
            res.writeHead(200);
            
            // 读取并发送文件
            const fileStream = fs.createReadStream(normalizedFilePath);
            fileStream.pipe(res);

            fileStream.on('error', (err) => {
                console.error(`[AlphaTab Debug] Error reading file ${normalizedFilePath}:`, err);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            });

            fileStream.on('end', () => {
                console.log(`[AlphaTab Debug] Successfully served: ${normalizedFilePath}`);
            });

        } catch (error) {
            // 500 错误也要加 CORS
            if (!res.headersSent) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                res.writeHead(500);
                res.end('Internal Server Error');
            }
            console.error('[AlphaTab Debug] Request handling error:', error);
        }
    }

    // 添加递归搜索字体文件的方法
    private searchForFontFiles(searchDir: string, maxDepth: number = 3): void {
        if (maxDepth <= 0) return;
        
        try {
            const items = fs.readdirSync(searchDir);
            console.log(`[AlphaTab Debug] Searching in: ${searchDir}`);
            
            for (const item of items) {
                const itemPath = path.join(searchDir, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isDirectory()) {
                    if (item === 'font' || item === 'fonts') {
                        console.log(`[AlphaTab Debug] Found font directory: ${itemPath}`);
                        const fontFiles = fs.readdirSync(itemPath);
                        console.log(`[AlphaTab Debug] Font files:`, fontFiles);
                    } else if (!item.startsWith('.')) {
                        this.searchForFontFiles(itemPath, maxDepth - 1);
                    }
                } else if (item.includes('font') || ['.woff', '.woff2', '.eot', '.otf'].some(ext => item.endsWith(ext))) {
                    console.log(`[AlphaTab Debug] Found font file: ${itemPath}`);
                }
            }
        } catch (error) {
            console.log(`[AlphaTab Debug] Error searching directory ${searchDir}:`, error);
        }
    }

    async stop(): Promise<void> {
        if (this.server) {
            return new Promise((resolve) => {
                this.server!.close(() => {
                    console.log('[AlphaTab Debug] Resource server stopped');
                    resolve();
                });
            });
        }
    }

    public getBaseUrl(): string {
        return `http://localhost:${this.port}`;
    }

    private configureAlphaTabSettings(): void {
        const resourceServer = this.pluginInstance?.getResourceServer();
        if (!resourceServer) {
            console.error("[AlphaTab Debug] Resource server not available");
            return;
        }
        
        const baseUrl = resourceServer.getBaseUrl();
        
        // 配置资源路径
        this.alphaTabSettings.core.fontDirectory = `${baseUrl}/assets/alphatab/`;
        this.alphaTabSettings.core.scriptFile = `${baseUrl}/assets/alphatab/alphaTab.mjs`;
        
        console.log("[AlphaTab Debug] Configured AlphaTab with resource server URLs:", {
            fontDirectory: this.alphaTabSettings.core.fontDirectory,
            scriptFile: this.alphaTabSettings.core.scriptFile
        });
    }

    // 确保正确设置 CORS 和 MIME 类型
    private setupRoutes(): void {
        // 设置 CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });
        
        // 静态文件服务，确保正确的 MIME 类型
        this.app.use('/assets', express.static(path.join(this.pluginDir, 'assets'), {
            setHeaders: (res, filePath) => {
                if (filePath.endsWith('.mjs')) {
                    res.setHeader('Content-Type', 'application/javascript');
                } else if (filePath.endsWith('.woff2')) {
                    res.setHeader('Content-Type', 'font/woff2');
                }
            }
        }));
    }
    
    // 添加查找匹配字体文件的方法
    private findMatchingFontFile(requestPath: string): string | null {
        const fontFileName = path.basename(requestPath).toLowerCase();
        const fontName = fontFileName.split('.')[0];  // 获取文件名（不带扩展名）
        
        // 搜索可能的字体目录
        const fontDirs = [
            path.join(this.pluginDir, 'assets', 'alphatab', 'font'),
        ];
        
        for (const fontDir of fontDirs) {
            if (!fs.existsSync(fontDir)) continue;
            
            const files = fs.readdirSync(fontDir);
            
            // 1. 精确匹配
            const exactMatch = files.find(f => f.toLowerCase() === fontFileName);
            if (exactMatch) return path.join(fontDir, exactMatch);
            
            // 2. 相似扩展名匹配（如 .woff2 vs .woff）
            const extensionVariants = files.filter(f => {
                const baseName = path.basename(f, path.extname(f)).toLowerCase();
                return baseName === fontName;
            });
            
            if (extensionVariants.length > 0) {
                // 优先 woff2, 其次 woff
                const woff2Match = extensionVariants.find(f => f.endsWith('.woff2'));
                if (woff2Match) return path.join(fontDir, woff2Match);
                
                const woffMatch = extensionVariants.find(f => f.endsWith('.woff'));
                if (woffMatch) return path.join(fontDir, woffMatch);
                
                // 如果没有 woff/woff2，返回第一个变体
                return path.join(fontDir, extensionVariants[0]);
            }
        }
        
        return null;
    }
}
