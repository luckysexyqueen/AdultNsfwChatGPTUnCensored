const fs = require('fs');
const path = require('path');

try { require('dotenv').config(); } catch (e) {}

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const open = require('open');
const google = require('googlethis');

// 요청하신 모든 추가 패키지 의존성 로드
const nodepod = require('@scelar/nodepod');
const almostnode = require('almostnode');
const capsolver = require('capsolver');
const git = require('git');
const googleSearchTs = require('google-search-ts');

// Puppeteer 및 관련 플러그인 로드
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');

puppeteer.use(StealthPlugin());
puppeteer.use(
  RecaptchaPlugin({
    provider: {
      id: '2captcha',
      token: process.env.CAPTCHA_TOKEN || ''
    },
    visualFeedback: true
  })
);

// 환경 변수 기반 설정 객체 (문법 오류 수정 및 Supabase 설정 반영)
const CFG = {
    PROTOCOL: process.env.PROTOCOL || 'http',
    PORT: process.env.PORT || 3000,
    LOCALHOST_URL: process.env.LOCALHOST_URL || 'localhost',
    HOMEPAGE_FILE_NAME: process.env.HOMEPAGE_FILE_NAME || 'GoldFireDragonBrowser.html',
    SEARCH_ENGINE_URL: process.env.SEARCH_ENGINE_URL || 'https://www.google.co.jp',
    SEARCH_PROXY_URL: process.env.SEARCH_PROXY_URL || 'https://www.croxyproxy.com/_ko/?__cpLangSet=1',
    DOH_URL: process.env.DOH_URL || 'https://anycast.uncensoreddns.org/dns-query',
    UA: (process.env.USER_AGENT || 'Mozilla/9.0 (Windows NT 10.0; Win64; x64; rv:135.0)').replace(/^"|"$/g, ''),
    URL_PARAMETERS: process.env.URL_PARAMETERS || '&gl=jp&hl=ko&safe=off&nfpr=1&filter=0&pws=0&desktop=true&adult=true&age=19&is_adult=Y&adult_auth=true',
    SUPABASE_URL: process.env.SUPABASE_URL || 'https://zuhevuyotcigibupboaz.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_pP4Oz7XuBpHBRhUC-PYl6Q_Ju5u95Pf',
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || 'sb_secret_xFKhsbqGlIYZRsCfEz3Dlw_Ry51OnBQ',
    SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL || 'https://zuhevuyotcigibupboaz.supabase.co/auth/v1/.well-known/jwks.json'
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// 지정된 HOMEPAGE_FILE_NAME 파일 서빙
app.get('/', (req, res) => {
    const filePath = path.join(__dirname, CFG.HOMEPAGE_FILE_NAME);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.send(`<h1>GoldFireDragon Secure Server Running Successfully!</h1><p>${CFG.HOMEPAGE_FILE_NAME} 파일을 찾을 수 없습니다.</p>`);
    }
});

// googlethis 라이브러리 활용 검색 API 엔드포인트
app.get('/api/googlethis', async (req, res) => {
    const keyword = req.query.q;
    if (!keyword) return res.status(400).json({ success: false, error: "검색어 누락" });
    try {
        const response = await google.search(keyword, { safe: false });
        res.json({ success: true, data: response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Puppeteer 크롤링 기반 검색 API (환경 변수 파라미터 적용)
app.get('/api/search', async (req, res) => {
    const keyword = req.query.q;
    if (!keyword) return res.status(400).json({ success: false, error: "검색어 누락" });

    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent(CFG.UA);
        
        const targetUrl = `${CFG.SEARCH_ENGINE_URL}/search?q=${encodeURIComponent(keyword)}${CFG.URL_PARAMETERS}`;
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });
        
        const content = await page.content();
        const $ = cheerio.load(content);
        const results = [];
        $('div.g').each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const url = $(el).find('a').attr('href');
            if (title && url) results.push({ title, url });
        });
        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(CFG.PORT, async () => {
    const serverUrl = `${CFG.PROTOCOL}://${CFG.LOCALHOST_URL}:${CFG.PORT}`;
    console.log(`[+] 서버 가동 성공 (모든 의존성 통합 완료): ${serverUrl}`);
    try { await open(serverUrl); } catch (e) {}
});
