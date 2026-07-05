from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("http://localhost:5173")  # Default vite port
    page.wait_for_timeout(2000) # Wait for initial load

    # Skip initial disclaimer / wizard based on memory notes
    try:
        page.get_by_text("Acknowledge").click(timeout=2000)
        page.wait_for_timeout(500)
    except:
        pass

    try:
        page.get_by_text("Skip for Now").click(timeout=2000)
        page.wait_for_timeout(500)
    except:
        pass

    # Open the shortlist panel
    try:
        # Search by title "Saved" for desktop tab bar, or just click element containing "Saved"
        page.get_by_text("Saved", exact=True).click(timeout=2000)
    except:
        pass

    page.wait_for_timeout(1000)

    # Take screenshot at the key moment (Shortlist Drawer with empty state)
    page.screenshot(path="verification.png")
    page.wait_for_timeout(1000)  # Hold final state for the video

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()  # MUST close context to save the video
            browser.close()
