import { chromium } from 'playwright';

const OUT = '/Users/samrastegar/.gemini/antigravity/brain/b4099805-e452-4803-be21-69876842a823';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Login as Field Technician Ali Yilmaz (Tier 5 - goes straight to Employee Portal)
  await page.click('button:has-text("Field Tech · Tier 5")');
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(1200);

  // 1. Front page directly after login: Arbeitszeiten ('checkin')
  await page.screenshot({ path: `${OUT}/verify_mobile_1_arbeitszeiten_front.png` });

  // 2. Click User Icon on top right -> Opens Read-only Info, Language, Password, Logout modal
  await page.click('.neo-header button');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/verify_mobile_2_user_profile_modal.png` });

  // Close User Modal
  await page.click('.modal-overlay .glass-panel button.btn-secondary');
  await page.waitForTimeout(300);

  // 3. Click Aufgaben tab (2nd tab in bottom nav)
  await page.click('.neo-bottom-nav button:nth-child(2)');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/verify_mobile_3_aufgaben_calendar.png` });

  // 4. Tap first task card -> Opens Task Details & Comments Pop-Up Modal
  const taskCard = page.locator('.neo-week-grid [style*="cursor: pointer"]').first();
  if (await taskCard.count() > 0) {
    await taskCard.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/verify_mobile_4_task_popup_modal.png` });
    await page.click('.modal-overlay .glass-panel button.btn-secondary');
    await page.waitForTimeout(300);
  }

  // 5. Click Lohn tab (5th tab in bottom nav) -> Monthly accordion (10 Oktober not uploaded / greyed out; 09 September uploaded / active)
  await page.click('.neo-bottom-nav button:nth-child(5)');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/verify_mobile_5_lohnabrechnung_greyed.png` });

  // Tap 09 · September 2026 to slide open the uploaded month
  await page.click('button:has-text("09 · September 2026")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/verify_mobile_6_lohnabrechnung_uploaded.png` });

  await browser.close();
  console.log('Done capturing mobile verification screenshots.');
})();
