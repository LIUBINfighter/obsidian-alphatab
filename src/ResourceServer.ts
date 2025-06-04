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
            const filePath = path.join(this.pluginDir, relativePath);

            console.log(`[AlphaTab Debug] === Resource Request Debug ===`);
            console.log(`[AlphaTab Debug] Request URL: ${req.url}`);
            console.log(`[AlphaTab Debug] URL Path: ${urlPath}`);
            console.log(`[AlphaTab Debug] Plugin Dir: ${this.pluginDir}`);
            console.log(`[AlphaTab Debug] Relative Path: ${relativePath}`);
            console.log(`[AlphaTab Debug] Constructed File Path: ${filePath}`);
            console.log(`[AlphaTab Debug] Resolved File Path: ${path.resolve(filePath)}`);
            console.log(`[AlphaTab Debug] File exists: ${fs.existsSync(filePath)}`);

            // 修复：正确的安全检查
            const normalizedPluginDir = path.resolve(this.pluginDir);
            const normalizedFilePath = path.resolve(filePath);
            
            if (!normalizedFilePath.startsWith(normalizedPluginDir)) {
                console.warn(`[AlphaTab Debug] Security: Blocked access outside plugin directory`);
                console.warn(`[AlphaTab Debug] Plugin dir: ${normalizedPluginDir}`);
                console.warn(`[AlphaTab Debug] Requested path: ${normalizedFilePath}`);
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            // 检查文件是否存在
            if (!fs.existsSync(normalizedFilePath)) {
                console.warn(`[AlphaTab Debug] File not found: ${normalizedFilePath}`);
                // 列出目录内容来调试
                const dirPath = path.dirname(normalizedFilePath);
                if (fs.existsSync(dirPath)) {
                    const files = fs.readdirSync(dirPath);
                    console.log(`[AlphaTab Debug] Directory contents (${dirPath}):`, files);
                    
                    // 特别检查是否是字体请求
                    if (relativePath.includes('font')) {
                        console.log(`[AlphaTab Debug] This is a font request that failed`);
                        console.log(`[AlphaTab Debug] Searching for font directories in plugin root...`);
                        
                        // 递归搜索字体文件
                        this.searchForFontFiles(normalizedPluginDir);
                    }
                } else {
                    console.log(`[AlphaTab Debug] Directory does not exist: ${dirPath}`);
                }
                res.writeHead(404);
                res.end('Not Found');
                return;
            }

            const stat = fs.statSync(normalizedFilePath);
            if (stat.isDirectory()) {
                console.log(`[AlphaTab Debug] Path is directory, not file: ${filePath}`);
                res.writeHead(403);
                res.end('Directory listing not allowed');
                return;
            }

            // 设置正确的Content-Type，特别是字体文件
            let mimeType = mime.lookup(filePath) || 'application/octet-stream';
            
            // 强制设置字体文件的正确 MIME 类型
            const ext = path.extname(filePath).toLowerCase();
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
            }

            console.log(`[AlphaTab Debug] File size: ${stat.size} bytes`);
            console.log(`[AlphaTab Debug] MIME type: ${mimeType}`);

            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', stat.size);
            
            // 设置CORS头
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            // 处理OPTIONS预检请求
            if (req.method === 'OPTIONS') {
                console.log(`[AlphaTab Debug] Handling OPTIONS request`);
                res.writeHead(200);
                res.end();
                return;
            }

            // 读取并发送文件
            console.log(`[AlphaTab Debug] Serving file: ${filePath}`);
            const fileStream = fs.createReadStream(filePath);
            res.writeHead(200);
            fileStream.pipe(res);

            fileStream.on('error', (err) => {
                console.error(`[AlphaTab Debug] Error reading file ${filePath}:`, err);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            });

            fileStream.on('end', () => {
                console.log(`[AlphaTab Debug] Successfully served: ${filePath}`);
            });

        } catch (error) {
            console.error('[AlphaTab Debug] Request handling error:', error);
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
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
}
