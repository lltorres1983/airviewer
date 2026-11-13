import { test, expect } from '@playwright/test';
import { fixtures, openLegacyMovements } from './fixtures';

test('painéis movem com teclado e restauram posição, sem alterar controles internos', async ({ page }) => {
  await fixtures(page); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  await page.getByRole('button', { name: 'Recolher radar compacto' }).click();
  for (const [selector, label] of [['.topbar', 'Mover identificação do voo'], ['#airport-camera', 'Mover câmera do aeroporto'], ['#arrivals-panel', 'Mover torre e spotting'], ['.controls', 'Mover controles do mapa']]) {
    const panel = page.locator(selector); const handle = page.getByRole('button', { name: label, exact: true });
    await expect(handle).toBeVisible(); const initial = (await panel.boundingBox())!;
    await handle.focus(); await page.keyboard.press('ArrowRight');
    await expect(panel).toHaveClass(/movable-floating/);
    const moved = (await panel.boundingBox())!;
    expect(moved.x).toBeCloseTo(Math.min(initial.x + 16, 1440 - moved.width - 12), 0);
    await page.keyboard.press('Home'); await expect(panel).not.toHaveClass(/movable-floating/);
  }
  await page.locator('#airport-select').selectOption('GIG');
  await expect(page.locator('#route')).toHaveText('TRAFEGO GIG');
  await expect(page.locator('.controls')).not.toHaveClass(/movable-floating/);
});

test('arraste preserva abas e redimensionamento dos movimentos', async ({ page }) => {
  await fixtures(page); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  const panel = page.locator('#arrivals-panel'); const handle = page.getByRole('button', { name: 'Mover torre e spotting', exact: true });
  await expect(handle).toBeVisible(); const before = (await panel.boundingBox())!, grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x+12, grip.y+12); await page.mouse.down(); await page.mouse.move(grip.x-108, grip.y+52, { steps: 8 }); await page.mouse.up();
  await expect(panel).toHaveClass(/movable-floating/);
  expect((await panel.boundingBox())!.x).toBeCloseTo(before.x - 120, 0);
  await openLegacyMovements(page);
  await page.locator('#live-tab').click(); await expect(page.locator('.arrival-row')).toContainText('TAM1234');
  const position = (await panel.boundingBox())!;
  await page.getByRole('button', { name: 'Redimensionar torre e spotting', exact: true }).focus(); await page.keyboard.press('ArrowDown');
  expect((await panel.boundingBox())!.height).toBeGreaterThan(position.height);
  await page.keyboard.press('ArrowLeft');
  expect((await panel.boundingBox())!.width).toBeGreaterThan(position.width);
  await panel.screenshot({ path: 'test-results/movable-movements.png' });
});

test.describe('movimento por toque', () => {
  test.use({ hasTouch: true });
  test('câmera no celular pode ser arrastada e restaurada', async ({ page }) => {
    await fixtures(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
    await page.locator('#mobile-menu-toggle').click(); await page.getByRole('button', { name: 'Câmera do aeroporto', exact: true }).click();
    const panel = page.locator('#airport-camera'); const handle = page.getByRole('button', { name: 'Mover câmera do aeroporto', exact: true });
    await expect(handle).toBeVisible(); const rect = (await handle.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x+12, y: rect.y+12 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x+24, y: rect.y+72 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(panel).toHaveClass(/movable-floating/);
    const moved = (await panel.boundingBox())!;
    expect(moved.x).toBeGreaterThanOrEqual(12); expect(moved.x+moved.width).toBeLessThanOrEqual(379);
    await handle.focus(); await page.keyboard.press('Home'); await expect(panel).not.toHaveClass(/movable-floating/);
    await cdp.detach();
  });
});
