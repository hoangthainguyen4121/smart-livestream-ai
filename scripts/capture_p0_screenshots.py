"""Capture P0 thesis screenshots per THESIS_P0_SCREENSHOTS.md (frozen checklist)."""
from __future__ import annotations

import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "thesis-screenshots"
BASE = "http://127.0.0.1:5173"


def shot(page, name: str, full_page: bool = False):
    path = OUT / name
    page.screenshot(path=str(path), full_page=full_page)
    print(f"saved {path.name}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
            ],
        )
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        # Health JSON (bonus, not P0)
        page.goto("http://127.0.0.1:8000/api/health")
        shot(page, "api-health-json.png")

        page.goto(BASE)
        page.wait_for_load_state("networkidle")

        # Select glasses + start stream
        page.get_by_role("button", name="Glasses", exact=False).click()
        page.get_by_role("button", name="Start Stream").click()
        time.sleep(2)

        shot(page, "demo-main-overview.png", full_page=True)

        # Pin different product if available
        pin_buttons = page.get_by_role("button", name="Pin product")
        if pin_buttons.count() > 1:
            pin_buttons.nth(1).click()
        elif pin_buttons.count() == 1:
            pin_buttons.first.click()
        time.sleep(0.5)
        shot(page, "product-catalog-pinned.png", full_page=True)

        # AR close-up: stream area
        stream = page.locator(".videoCard").first
        if stream.count():
            stream.screenshot(path=str(OUT / "browser-ar-glasses.png"))
            print("saved browser-ar-glasses.png")

        # Register face
        page.goto(f"{BASE}/register-face")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        shot(page, "register-face-ui.png", full_page=True)

        # Back to demo for chat/commerce
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="Start Stream").click()
        time.sleep(1.5)

        chat_input = page.get_by_placeholder("Hỏi về sản phẩm")
        chat_input.fill("son này bao nhiêu tiền vậy shop?")
        page.keyboard.press("Enter")
        time.sleep(2.5)
        chat_panel = page.locator(".chatPanel").first
        if chat_panel.count():
            chat_panel.screenshot(path=str(OUT / "chat-panel-reply.png"))
        else:
            shot(page, "chat-panel-reply.png")

        sa = page.locator(".salesAssistantPanel").first
        if sa.count():
            sa.screenshot(path=str(OUT / "sales-assistant-events.png"))
        else:
            shot(page, "sales-assistant-events.png")

        if chat_panel.count():
            chat_panel.screenshot(path=str(OUT / "ml-intent-badge.png"))
        else:
            shot(page, "ml-intent-badge.png")

        page.get_by_role("button", name="Thêm", exact=False).first.click()
        time.sleep(0.5)
        cart = page.locator(".cartPanel").first
        if cart.count():
            cart.screenshot(path=str(OUT / "cart-with-item.png"))
        else:
            shot(page, "cart-with-item.png")

        page.get_by_role("button", name="Thanh toán").click()
        time.sleep(0.5)
        page.get_by_placeholder("Nguyễn Văn A").fill("Nguyen Van A")
        page.get_by_placeholder("0901234567").fill("0901234567")
        page.get_by_placeholder("Quận/Huyện, TP.HCM").fill("123 Duong Demo, Q1, TP.HCM")
        page.locator(".checkoutModal select").last.select_option(value="cod")
        modal = page.locator(".checkoutModal").first
        modal.screenshot(path=str(OUT / "checkout-modal-cod.png"))
        print("saved checkout-modal-cod.png")

        page.get_by_role("button", name="Xác nhận đặt hàng demo").click()
        time.sleep(0.8)
        order = page.locator("section.orderSummary").first
        order.screenshot(path=str(OUT / "order-summary-cod.png"))
        print("saved order-summary-cod.png")

        page.reload()
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="Start Stream").click()
        time.sleep(1)
        page.get_by_role("button", name="Thêm", exact=False).first.click()
        time.sleep(0.3)
        page.get_by_role("button", name="Thanh toán").click()
        time.sleep(0.3)
        page.get_by_placeholder("Nguyễn Văn A").fill("Nguyen Van A")
        page.get_by_placeholder("0901234567").fill("0901234567")
        page.get_by_placeholder("Quận/Huyện, TP.HCM").fill("123 Demo")
        page.locator(".checkoutModal select").last.select_option(value="mock_qr")
        page.get_by_role("button", name="Xác nhận đặt hàng demo").click()
        time.sleep(2)
        order.screenshot(path=str(OUT / "order-summary-qr-paid.png"))
        print("saved order-summary-qr-paid.png")

        browser.close()
    print("P0 capture session complete.")


if __name__ == "__main__":
    main()
