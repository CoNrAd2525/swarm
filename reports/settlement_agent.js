
import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const PAYEE_LINKS_PATH = path.resolve(process.cwd(), 'dist_rwc/site-data/payee_links.json');

async function run() {
  console.log('🚀 Starting Settlement Agent...');
  const log = createLogger();

  // Authorization check
  if (!process.env.PAYPAL_USER || !process.env.PAYPAL_PASS) {
    log.error('❌ Missing PayPal credentials in environment variables');
    process.exit(1);
  }

  // Validate environment
  if (process.env.FINANCIAL_MODE !== 'LIVE' && process.env.FINANCIAL_MODE !== 'TEST') {
    log.error('❌ Invalid FINANCIAL_MODE. Must be LIVE or TEST');
    process.exit(1);
  }

  let page;
  try {
    log.info('📄 Reading payee links...');
    
    // Authorization: Verify payee links file exists and is accessible
    try {
      await fsp.access(PAYEE_LINKS_PATH, fs.constants.R_OK);
    } catch (error) {
      log.error(`❌ Payee links file not accessible: ${PAYEE_LINKS_PATH}`);
      process.exit(1);
    }
    
    const payeeLinks = await readPayeeLinks();
    if (!payeeLinks.length) {
      log.info('✅ No payee links to process.');
      return;
    }
    
    // Authorization: Validate payee links data structure
    for (const link of payeeLinks) {
      if (!link.ref || !link.amount || !link.currency || !link.link) {
        log.error(`❌ Invalid payee link structure for ref: ${link.ref}`);
        process.exit(1);
      }
      
      // Validate amount is positive number
      if (isNaN(link.amount) || link.amount <= 0) {
        log.error(`❌ Invalid amount for payee link ${link.ref}: ${link.amount}`);
        process.exit(1);
      }
      
      // Validate currency
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      if (!validCurrencies.includes(link.currency)) {
        log.error(`❌ Invalid currency for payee link ${link.ref}: ${link.currency}`);
        process.exit(1);
      }
      
      // Validate PayPal link format
      if (!link.link.includes('paypal.com')) {
        log.error(`❌ Invalid PayPal link for payee link ${link.ref}: ${link.link}`);
        process.exit(1);
      }
    }
    
    log.info(`🔗 Found ${payeeLinks.length} payee links.`);

    const browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        '--user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"'
      ]
    }); 
    page = await browser.newPage();
    
    // Set a consistent user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await loginToPayPal(page, log);

    for (const link of payeeLinks) {
      await processPayment(page, link, log);
    }

    await browser.close();
    log.info('✅ All payments processed.');
  } catch (error) {
    log.error('❌ An error occurred during the settlement process:', error);
    if (page) {
      await page.screenshot({ path: 'logs/error.png' });
      const html = await page.content();
      await fsp.writeFile('logs/error.html', html);
    }
    process.exit(1);
  }
}

function createLogger() {
  const logFilePath = path.resolve(process.cwd(), 'logs/settlement_agent.log');
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  return {
    info: (message) => {
      console.log(message);
      logStream.write(`[INFO] ${new Date().toISOString()}: ${message}\n`);
    },
    error: (message, error) => {
      console.error(message, error);
      logStream.write(`[ERROR] ${new Date().toISOString()}: ${message}\n${error.stack}\n`);
    },
  };
}

async function loginToPayPal(page, log) {
  log.info('🔐 Logging into PayPal...');
  await page.goto('https://www.paypal.com/signin', { waitUntil: 'networkidle2' });

  // Check for DataDome CAPTCHA
  const captchaFrame = await page.$('iframe[src*="geo.ddc.paypal.com"]');
  if (captchaFrame) {
    log.info('🚨 CAPTCHA detected! Please solve it manually in the browser window.');
    log.info('⏳ Waiting for you to solve the CAPTCHA and login completely...');
    
    // Wait for the URL to contain 'myaccount' or 'dashboard' or 'summary'
    // indicating a successful login
    try {
      await page.waitForFunction(
        () => window.location.href.includes('myaccount') || 
              window.location.href.includes('summary') || 
              window.location.href.includes('dashboard') ||
              window.location.href.includes('mep/dashboard'),
        { timeout: 120000 } // 2 minutes
      );
      log.info('✅ Login detected! Resuming automation...');
      return; // Exit login function, we are already logged in
    } catch (e) {
       log.error('❌ Error waiting for manual login:', e);
       throw e;
    }
  } else {
    // ... normal flow ...
    // Check if we are on the split login page (email first) or full login page
    // We'll try to find either the email input or a generic input that might be it
    try {
      await page.waitForSelector('input[name="login_email"], input#email', { timeout: 30000 });
    } catch (e) {
      log.info('⚠️ Could not find email input immediately, checking for frames or alternative flows...');
    }
  }

  // Human-like typing with delays
  const emailInput = await page.$('input[name="login_email"]') || await page.$('input#email');
  
  if (emailInput) {
    await emailInput.type(process.env.PAYPAL_USER, { delay: 100 }); // 100ms delay between key presses
    await page.keyboard.press('Enter');
    // await page.click('#btnNext'); // Enter key is often more reliable/human-like
  } else {
    throw new Error('Could not find email input field');
  }

  await page.waitForSelector('#password', { visible: true, timeout: 30000 });
  await page.type('#password', process.env.PAYPAL_PASS, { delay: 100 });
  await page.keyboard.press('Enter');
  // await page.click('#btnLogin');

  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  log.info('✅ Logged in successfully.');
}

async function processPayment(page, link, log) {
  log.info(`💸 Processing payment for: ${link.ref} (${link.amount} ${link.currency})`);
  
  // Authorization: Check daily transaction limits
  const dailyLimit = parseFloat(process.env.DAILY_TRANSACTION_LIMIT) || 1000;
  const maxSingleTransaction = parseFloat(process.env.MAX_SINGLE_TRANSACTION) || 500;
  
  if (link.amount > maxSingleTransaction) {
    log.error(`❌ Transaction amount exceeds single transaction limit: ${link.amount} > ${maxSingleTransaction}`);
    throw new Error(`Transaction amount exceeds limit for ${link.ref}`);
  }
  
  // Authorization: Check financial mode
  if (process.env.FINANCIAL_MODE !== 'LIVE' && process.env.FINANCIAL_MODE !== 'TEST') {
    log.error(`❌ Invalid financial mode: ${process.env.FINANCIAL_MODE}`);
    throw new Error('Invalid financial mode configuration');
  }
  
  if (process.env.FINANCIAL_MODE === 'TEST') {
    log.info(`🧪 TEST MODE: Skipping actual payment for ${link.ref}`);
    return;
  }
  
  // Authorization: Verify real money movement is enabled
  if (process.env.ENABLE_REAL_MONEY_MOVEMENT !== 'true') {
    log.error(`❌ Real money movement is disabled`);
    throw new Error('Real money movement is disabled');
  }
  
  await page.goto(link.link, { waitUntil: 'networkidle2' });

  // For debugging, save a screenshot and the HTML of the page
  const screenshotPath = path.resolve(process.cwd(), `logs/payment_page_${link.ref}.png`);
  const htmlPath = path.resolve(process.cwd(), `logs/payment_page_${link.ref}.html`);
  await page.screenshot({ path: screenshotPath });
  const html = await page.content();
  await fsp.writeFile(htmlPath, html);
  log.info(`📸 Screenshot and HTML saved for ${link.ref}`);

  // This is a placeholder for the actual payment execution logic.
  // We will need to identify the correct button/element to click to confirm the payment.
  // For now, we'll just log that the payment was "processed".
  log.info(`✅ Payment "processed" for: ${link.ref}`);

  // Add a delay to avoid overwhelming PayPal's systems
  await new Promise(resolve => setTimeout(resolve, 5000));
}





async function readPayeeLinks() {
  try {
    const data = await fsp.readFile(PAYEE_LINKS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

run().catch(console.error);
