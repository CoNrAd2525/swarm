const fs = require('fs');
const path = require('path');
const commDir = 'exports/communications';
const queueFile = 'data/email_queue.json';

// Read all JSON files from communications directory
const files = fs.readdirSync(commDir).filter(f => f.endsWith('.json'));
const emails = [];

files.forEach(file => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(commDir, file), 'utf8'));
    if (data.email) {
      emails.push(data.email);
    }
  } catch (e) {
    console.error('Error reading', file, e.message);
  }
});

// Ensure data directory exists
if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });

// Write to queue
fs.writeFileSync(queueFile, JSON.stringify(emails, null, 2));
console.log('Loaded', emails.length, 'emails into queue');