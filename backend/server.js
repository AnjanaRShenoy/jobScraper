const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false }, // Good practice for Node backends
    realtime: { transport: ws }       // This fixes your Node v20 error!
  }
);

/**
 * 🔄 Resilient Multi-Source Scraper with Location Parsing for Table UI
 */
async function scrapeJobs() {
  console.log('🔄 Starting tailored job scrape...');
  let browser;
  try {
    // Check if running on Vercel or locally
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;

    browser = await puppeteer.launch({
      args: isProd ? chromium.args : [],
      defaultViewport: chromium.defaultViewport,
      executablePath: isProd
        ? await chromium.executablePath()
        : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // <-- Path to your LOCAL Chrome for local testing (Mac example)
      headless: isProd ? chromium.headless : true,
    });

    const page = await browser.newPage();

    // Pretend to be an authentic Windows Chrome user
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Extra layer: trick the browser fingerprint checks
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const targetLinkedInUrl = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=MERN%20Stack%20Developer&location=India&f_TPR=r86400&f_WT=2%2C3&f_E=1%2C2%2C3&f_PP=102713980%2C105214831%2C103982205';


    console.log(`📡 Querying primary target (LinkedIn India)...`);

    // Add artificial delay before request to prevent immediate ban
    await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));

    await page.goto(targetLinkedInUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    let collectedJobs = await page.evaluate(() => {
      const jobElements = document.querySelectorAll('li');
      const results = [];

      jobElements.forEach(el => {
        const titleEl = el.querySelector('.base-search-card__title');
        const companyEl = el.querySelector('.base-search-card__subtitle a, .base-search-card__subtitle');
        const linkEl = el.querySelector('a.base-card__full-link');
        const placeEl = el.querySelector('.job-search-card__location'); // Matches LinkedIn's location card marker

        if (titleEl && linkEl) {
          results.push({
            title: titleEl.innerText.trim(),
            company: companyEl ? companyEl.innerText.trim() : 'Confidential Hiring',
            place: placeEl ? placeEl.innerText.trim() : 'Tamil Nadu / Bangalore / Kerala', // Fallback context
            url: linkEl.href.split('?')[0]
          });
        }
      });
      return results;
    });

    // --- 🚨 CRITICAL FALLBACK AUTOMATION LAYER 🚨 ---
    if (collectedJobs.length === 0) {
      console.log('⚠️ LinkedIn IP limit detected. Activating highly reliable backup (WeWorkRemotely)...');

      await page.goto('https://weworkremotely.com/categories/remote-full-stack-programming-jobs', { waitUntil: 'networkidle2', timeout: 30000 });

      collectedJobs = await page.evaluate(() => {
        const jobElements = document.querySelectorAll('.jobs li:not(.view-all)');
        const results = [];

        jobElements.forEach(el => {
          const titleEl = el.querySelector('.title');
          const companyEl = el.querySelector('.company');
          const linkEl = el.querySelector('a[href^="/remote-jobs/"]');
          const regionEl = el.querySelector('.region');

          const titleText = titleEl?.innerText.toLowerCase() || '';
          // Ensure it matches entry or mid-level developer keywords
          const isMernOrJs = titleText.match(/(mern|javascript|react|node|express|fullstack)/);

          if (titleEl && linkEl && isMernOrJs) {
            results.push({
              title: titleEl.innerText.trim(),
              company: companyEl ? companyEl.innerText.trim() : 'Remote Tech Corp',
              place: regionEl ? `Remote (${regionEl.innerText.trim()})` : 'Remote (Global)',
              url: 'https://weworkremotely.com' + linkEl.getAttribute('href')
            });
          }
        });
        return results;
      });
    }

    // --- DATABASE SYNCHRONIZATION ---
    if (collectedJobs.length === 0) {
      console.log('❌ Both networks exhausted or blocked. Try waiting a few minutes for IP cooldown.');
      return;
    }

    console.log(`📦 Formatting ${collectedJobs.length} records into structural columns...`);

    const { error } = await supabase
      .from('jobs')
      .upsert(collectedJobs, { onConflict: 'url' });

    if (error) {
      console.error('❌ Supabase Client Error:', error.message);
    } else {
      console.log(`✅ Table synchronized successfully with live listings.`);
    }

  } catch (error) {
    console.error('❌ Automation engine failure:', error);
  } finally {
    await browser.close();
  }
}

// 🕒 Cron Schedule: Runs every 4 hours
cron.schedule('0 */4 * * *', () => {
  console.log('⏰ 4-Hour timer triggered...');
  scrapeJobs();
});

/**
 * 🌐 API Endpoint
 * Optional: Your React app can fetch from this Express endpoint, 
 * OR fetch directly from Supabase.
 */
app.get('/api/jobs', async (req, res) => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// A quick helper route so you can test the scraper manually via your browser or Postman
app.post('/api/scrape-now', async (req, res) => {
  await scrapeJobs();
  res.json({ message: "Scraper executed manually." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  // Optional: Run once on startup so you don't wait 4 hours for data
  // scrapeJobs(); 
});