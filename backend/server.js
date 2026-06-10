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
// 1. DEDICATED NAUKRI AUTOMATION LAYER
async function scrapeNaukri(page) {
  console.log('📡 Querying fallback target with freshness filters (Naukri India)...');
  
  // Updated URL with your exact parameters (Work from Home/Hybrid, Exp, Tech Hubs, and Freshness < 1 day)
  const naukriUrl = 'https://www.naukri.com/mern-stack-developer-jobs?k=mern%20stack%20developer&nignbevent_src=jobsearchDeskGNB&wfhType=2&wfhType=3&experience=5&cityTypeGid=97&cityTypeGid=110&cityTypeGid=120&cityTypeGid=183&cityTypeGid=184&cityTypeGid=6108&jobAge=1';
  
  try {
    // Navigate and mimic human delay behavior
    await page.goto(naukriUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    
    // Explicitly wait for the dynamic job tuple wrappers to load into the DOM
    await page.waitForSelector('.srp-jobtuple-wrapper', { timeout: 7000 });

    const jobs = await page.evaluate(() => {
      const rowElements = document.querySelectorAll('.srp-jobtuple-wrapper');
      const results = [];

      rowElements.forEach(el => {
        const titleEl = el.querySelector('a.title');
        const companyEl = el.querySelector('a.comp-name, .comp-name');
        const placeEl = el.querySelector('.locWraper .loc-text, .location');

        if (titleEl) {
          results.push({
            title: titleEl.innerText.trim(),
            company: companyEl ? companyEl.innerText.trim() : 'Confidential Hiring',
            place: placeEl ? placeEl.innerText.trim() : 'India',
            // Naukri abstracts dynamic variables into search hashes; titleEl.href contains the exact direct application link
            url: titleEl.href 
          });
        }
      });
      return results;
    });

    console.log(`✨ Found ${jobs.length} fresh Naukri listings posted within 24 hours.`);
    return jobs;

  } catch (err) {
    console.error('⚠️ Naukri filtering skipped or blocked:', err.message);
    return []; // Fall back gracefully to avoid breaking the overarching pipeline orchestrator
  }
}

// 2. ORCHESTRATED PRIMARY AUTOMATION ENGINE
async function scrapeJobs() {
  console.log('🔄 Starting tailored multi-source job scrape...');
  let browser;

  try {
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
    let launchOptions = {};

    if (isProd) {
      const chromium = require('@sparticuz/chromium');
      launchOptions = {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      };
    } else {
      launchOptions = {
        args: [],
        // Update this line to point to your Windows Chrome installation:
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false, // Set to false so you can watch it open a browser window and scrape!
      };
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    let collectedJobs = [];

    // --- STEP 1: LINKEDIN ---
    try {
      const targetLinkedInUrl = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=MERN%20Stack%20Developer&location=India&f_TPR=r86400&f_WT=2%2C3&f_E=1%2C2%2C3&f_PP=102713980%2C105214831%2C103982205';
      await new Promise(r => setTimeout(r, Math.random() * 1000 + 500));
      await page.goto(targetLinkedInUrl, { waitUntil: 'networkidle2', timeout: 12000 });

      collectedJobs = await page.evaluate(() => {
        const jobElements = document.querySelectorAll('li');
        const results = [];
        jobElements.forEach(el => {
          const titleEl = el.querySelector('.base-search-card__title');
          const companyEl = el.querySelector('.base-search-card__subtitle a, .base-search-card__subtitle');
          const linkEl = el.querySelector('a.base-card__full-link');
          const placeEl = el.querySelector('.job-search-card__location');

          if (titleEl && linkEl) {
            results.push({
              title: titleEl.innerText.trim(),
              company: companyEl ? companyEl.innerText.trim() : 'Confidential Hiring',
              place: placeEl ? placeEl.innerText.trim() : 'India',
              url: linkEl.href.split('?')[0]
            });
          }
        });
        return results;
      });
    } catch (e) {
      console.log('⚠️ LinkedIn step timed out or encountered an issue.');
    }

    // --- STEP 2: NAUKRI FALLBACK ---
    if (collectedJobs.length === 0) {
      console.log('⚠️ LinkedIn pool empty. Activating Naukri scraper pipeline...');
      collectedJobs = await scrapeNaukri(page);
    }

    // --- STEP 3: WEWORKREMOTELY CRITICAL FALLBACK ---
    if (collectedJobs.length === 0) {
      console.log('⚠️ Primary networks exhausted. Activating fallback backup (WeWorkRemotely)...');
      await page.goto('https://weworkremotely.com/categories/remote-full-stack-programming-jobs', { waitUntil: 'networkidle2', timeout: 12000 });

      collectedJobs = await page.evaluate(() => {
        const jobElements = document.querySelectorAll('.jobs li:not(.view-all)');
        const results = [];
        jobElements.forEach(el => {
          const titleEl = el.querySelector('.title');
          const companyEl = el.querySelector('.company');
          const linkEl = el.querySelector('a[href^="/remote-jobs/"]');
          const regionEl = el.querySelector('.region');

          const titleText = titleEl?.innerText.toLowerCase() || '';
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
      console.log('❌ All sources exhausted or blocked.');
      return [];
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

    return collectedJobs;

  } catch (error) {
    console.error('❌ Automation engine failure:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
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