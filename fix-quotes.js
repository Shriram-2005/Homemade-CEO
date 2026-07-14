const fs = require('fs');
const path = 'D:/Saina Human AI/Homemade CEO/Prototype/js/jami.js';
let file = fs.readFileSync(path, 'utf8');

file = file.replace(/<i data-lucide="([^"]+)" class="([^"]+)"><\/i>/g, "<i data-lucide='$1' class='$2'></i>");

fs.writeFileSync(path, file);
