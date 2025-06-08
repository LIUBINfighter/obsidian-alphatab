import fs from 'fs';
import path from 'path';

const stylesDir = path.join(process.cwd(), './styles');
const outputFile = path.join(process.cwd(), './styles.css');

if (!fs.existsSync(stylesDir)) {
    console.error(`目录不存在: ${stylesDir}`);
    process.exit(1);
}

const cssFiles = fs.readdirSync(stylesDir)
    .filter(f => f.endsWith('.css'))
    .sort();

let merged = '';
for (const file of cssFiles) {
    const filePath = path.join(stylesDir, file);
    merged += `/* --- ${file} --- */\n`;
    merged += fs.readFileSync(filePath, 'utf-8') + '\n';
}

fs.writeFileSync(outputFile, merged, 'utf-8');
console.log(`merged ${cssFiles.length} css files and save to ${outputFile}`);
