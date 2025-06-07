// 这是一个简单的repomix思路的脚本
// node ./scripts/mix-code.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../src');
const stylesFile = path.join(__dirname, '../styles.css');

// 生成简短的时间戳文件名
function getShortTimestamp() {
    const now = new Date();
    // const yyyy = now.getFullYear(); // 删除年份
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${mm}${dd}-${hh}${min}${ss}`;
}

// 检查 ./mix 目录是否存在，不存在则创建
const mixDir = path.join(__dirname, './mix');
if (!fs.existsSync(mixDir)) {
    fs.mkdirSync(mixDir, { recursive: true });
}

const outputFile = path.join(mixDir, `merged-${getShortTimestamp()}.mix.txt`);

// 检查srcDir是否存在
if (!fs.existsSync(srcDir)) {
    console.error(`目录不存在: ${srcDir}`);
    process.exit(1);
}

function getAllTsFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllTsFiles(filePath));
        } else if (file.endsWith('.ts')) {
            results.push(filePath);
        }
    });
    return results;
}

function mergeFiles() {
    const files = getAllTsFiles(srcDir);
    let merged = '';
    files.forEach(file => {
        const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
        merged += `// <-- ./${relPath} -->\n`;
        merged += fs.readFileSync(file, 'utf-8') + '\n';
    });

    // 合并 styles.css
    if (fs.existsSync(stylesFile)) {
        const relPath = path.relative(process.cwd(), stylesFile).replace(/\\/g, '/');
        merged += `// <-- ./${relPath} -->\n`;
        merged += fs.readFileSync(stylesFile, 'utf-8') + '\n';
    }

    fs.writeFileSync(outputFile, merged, 'utf-8');
    console.log(`Merged ${files.length} ts files${fs.existsSync(stylesFile) ? ' and styles.css' : ''} into ${outputFile}`);
}

mergeFiles();
