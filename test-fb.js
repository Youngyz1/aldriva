import dotenv from 'dotenv';
import path from 'path';
import { publishToFacebook } from './lib/facebookPublisher.js';

// Manually target and load your local environment configurations
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function startTest() {
  console.log("Sending clean test to Aldriva page feed...");
  try {
    const postId = await publishToFacebook(
      "Testing production social media sync from my website backend.",
      "https://aldriva.com"
    );
    console.log("✅ Post Success! Live ID:", postId);
  } catch (err) {
    console.error("❌ Error sending to Meta:", err.message);
  }
}

startTest();
