import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';

export class ResourceServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private pluginDir: string;

    constructor(pluginDir: string) {
        this.pluginDir = pluginDir;
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
            const filePath = path.join(this.pluginDir, urlPath);

            console.log(`[AlphaTab Debug] === Font Request Debug ===`);
            console.log(`[AlphaTab Debug] Request URL: ${req.url}`);
            console.log(`[AlphaTab Debug] URL Path: ${urlPath}`);
            console.log(`[AlphaTab Debug] Plugin Dir: ${this.pluginDir}`);
            console.log(`[AlphaTab Debug] Full File Path: ${filePath}`);
            console.log(`[AlphaTab Debug] File exists: ${fs.existsSync(filePath)}`);

            // 安全检查
            if (!filePath.startsWith(this.pluginDir)) {
                console.warn(`[AlphaTab Debug] Blocked access outside plugin directory: ${filePath}`);
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                console.warn(`[AlphaTab Debug] File not found: ${filePath}`);
                // 列出目录内容来调试
                const dirPath = path.dirname(filePath);
                if (fs.existsSync(dirPath)) {
                    const files = fs.readdirSync(dirPath);
                    console.log(`[AlphaTab Debug] Directory contents (${dirPath}):`, files);
                } else {
                    console.log(`[AlphaTab Debug] Directory does not exist: ${dirPath}`);
                }
                res.writeHead(404);
                res.end('Not Found');
                return;
            }

            const stat = fs.statSync(filePath);
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

    getBaseUrl(): string {
        return `http://localhost:${this.port}`;
    }
}
