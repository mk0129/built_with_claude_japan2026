import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const address = process.argv[2];
if (!address) throw new Error('Usage: node smoke-browser.mjs <demo-url>');
const browser = await chromium.launch({headless:true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined});
try {
  const context = await browser.newContext({ locale:'ja-JP', timezoneId:'Asia/Tokyo', viewport:{width:1180,height:820} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(address).origin) {
      errors.push(response.status() + ' ' + new URL(response.url()).pathname);
    }
  });
  await page.goto(address, {waitUntil:'domcontentloaded'});
  await page.getByRole('button', {name:'患者として体験', exact:true}).click();
  const note = '次の診察で相談したいこと（審査用の架空メモ）';
  await page.locator('[data-home-note-input]').fill(note);
  await page.locator('[data-home-note-add]').click();
  await page.getByText(note,{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'医師側',exact:true}).click();
  const question = page.locator('[data-key-question]').filter({hasText:note}).first();
  await question.getByRole('button').first().click();
  assert.match(await question.innerText(), /審査用の架空メモ/u);
  assert.deepEqual(errors, []);
  console.log('Verified the patient-to-clinician question and its source.');
} finally {
  await browser.close();
}
