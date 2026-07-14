const fs = require('fs');
const path = 'D:/Saina Human AI/Homemade CEO/Prototype/js/jami.js';
let file = fs.readFileSync(path, 'utf8');

const emojiMap = {
  '🙏': '<i data-lucide="heart-handshake" class="icon-sm"></i>',
  '🌟': '<i data-lucide="sparkles" class="icon-sm"></i>',
  '😊': '<i data-lucide="smile" class="icon-sm"></i>',
  '🌿': '<i data-lucide="leaf" class="icon-sm"></i>',
  '😍': '<i data-lucide="heart" class="icon-sm"></i>',
  '📸': '<i data-lucide="camera" class="icon-sm"></i>',
  '🎉': '<i data-lucide="party-popper" class="icon-sm"></i>'
};

for (const [emoji, icon] of Object.entries(emojiMap)) {
  file = file.split(emoji).join(icon);
}

file = file.split(' — ').join(' - ');
file = file.replace('Use emojis sparingly for warmth', 'Use lucide icons sparingly for warmth instead of emojis.');

fs.writeFileSync(path, file);
