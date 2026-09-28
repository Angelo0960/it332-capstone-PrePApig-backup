const fs = require('fs');
let c = fs.readFileSync('src\\pages\\AnalyticsReportScreen.jsx', 'utf8');
let braceCount = 0;
let parenCount = 0;
let inString = false;
let stringChar = '';
for (let i = 0; i < c.length; i++) {
  const ch = c[i];
  if (inString) {
    if (ch === stringChar && c[i-1] !== '\\') inString = false;
  } else {
    if (ch === '\"' || ch === \"'\") {
      inString = true;
      stringChar = ch;
    } else if (ch === '{') braceCount++;
    else if (ch === '}') braceCount--;
    else if (ch === '(') parenCount++;
    else if (ch === ')') parenCount--;
  }
}
console.log('Brace balance:', braceCount);
console.log('Paren balance:', parenCount);
console.log('Should both be 0 for balanced code');