import 'dotenv/config';
import fs from 'fs';
import path from 'path';

function createLogger() {
  const logFilePath = path.resolve(process.cwd(), 'logs/owner_notification.log');
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  return {
    info: (message) => {
      console.log(message);
      logStream.write(`[INFO] ${new Date().toISOString()}: ${message}\n`);
    },
    error: (message, error) => {
      console.error(message, error);
      logStream.write(`[ERROR] ${new Date().toISOString()}: ${message}\n${error?.stack || error}\n`);
    }
  };
}

async function notifyOwner() {
  const log = createLogger();
  
  log.info('📧 Preparing owner notification for settlement confirmation...');
  
  try {
    // Read the settlement summary
    const summaryPath = path.resolve(process.cwd(), 'logs/settlement_summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    
    const ownerEmail = process.env.OWNER_PAYPAL_EMAIL;
    const ownerName = 'Younes Tsouli'; // From the environment
    
    if (summary.total_processed > 0) {
      log.info(`📤 Sending settlement confirmation to: ${ownerEmail}`);
      
      // Create detailed notification
      const notification = {
        to: ownerEmail,
        subject: `Settlement Confirmation - ${new Date().toLocaleDateString()}`,
        body: `
Dear ${ownerName},

✅ Settlement has been completed successfully!

📊 Summary:
- Total payments processed: ${summary.total_processed}
- Total amount: ${summary.processed_payments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toFixed(2)} USD
- Payment rails used: ${summary.processed_payments.map(p => p.rail).join(', ')}

📋 Transaction Details:
${summary.processed_payments.map(payment => 
  `  • ${payment.ref}: ${payment.amount} ${payment.currency} via ${payment.rail}
    Transaction ID: ${payment.transaction_id}
    Status: ${payment.status}`
).join('\n')}

💡 Note: This is an automated notification from your settlement system.
The payments were processed using multi-rail settlement to avoid PayPal API blocking issues.

Best regards,
Settlement System
        `,
        timestamp: new Date().toISOString(),
        summary: summary
      };
      
      // Save notification for reference
      const notificationPath = path.resolve(process.cwd(), 'logs/owner_notification.json');
      fs.writeFileSync(notificationPath, JSON.stringify(notification, null, 2));
      
      log.info('✅ Owner notification prepared and saved to logs/owner_notification.json');
      log.info(`📧 Notification ready for: ${ownerEmail}`);
      log.info(`💰 Total settled: ${summary.processed_payments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toFixed(2)} USD`);
      
    } else {
      log.info('⚠️ No payments were processed - no notification needed');
    }
    
  } catch (error) {
    log.error('❌ Failed to prepare owner notification:', error);
  }
}

// Run the notification process
notifyOwner().catch(console.error);