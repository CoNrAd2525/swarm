
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';

const PAYEE_LINKS_PATH = path.resolve(process.cwd(), 'dist_rwc/site-data/payee_links.json');

async function run() {
  console.log('💰 Generating payee links...');

  // This is a placeholder for the logic to generate the payee links.
  // In a real-world scenario, this would involve fetching data from a database
  // or an API. For now, we'll just create a dummy file.
  const dummyLinks = [
    {
      "ref": "test-payment-1",
      "amount": "0.01",
      "currency": "USD",
      "link": "https://www.paypal.com/paypalme/YounesTsouli/0.01USD"
    }
  ];

  await fs.writeFile(PAYEE_LINKS_PATH, JSON.stringify(dummyLinks, null, 2));

  console.log('✅ Payee links generated successfully.');
}

run().catch(console.error);
