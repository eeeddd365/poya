import os
from playwright.sync_api import sync_playwright
from supabase import create_client

# 環境變數
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 測試特定網址
TARGET_URL = "https://www.poyabuy.com.tw/v2/official/SalePageCategory/374016?sortMode=Sales"

def scrape():
    with sync_playwright() as p:
        # 啟動瀏覽器
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            viewport={'width': 1280, 'height': 800}
        )
        page = context.new_page()

        print(f"🚀 正在存取網址: {TARGET_URL}")
        
        try:
            # 進入頁面並等待
            page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(7000) # 多等 7 秒確保渲染完成

            # 模擬捲動觸發 Lazy Load
            page.mouse.wheel(0, 2000)
            page.wait_for_timeout(3000)

            # 偵錯：截圖留存（如果失敗可以在 GitHub Actions 看到頁面長怎樣）
            page.screenshot(path="debug_screen.png")
            print("📸 已截圖存檔為 debug_screen.png")

            # 抓取邏輯：針對 91APP 體系的商品卡片結構
            # 1. 先抓所有商品 A 標籤
            product_nodes = page.locator("a[href*='SalePage']").all()
            print(f"🔍 找到潛在商品節點數: {len(product_nodes)}")

            data_list = []
            for node in product_nodes:
                try:
                    # 抓取圖片：尋找 A 標籤內的 img
                    img_el = node.locator("img").first
                    img_url = img_el.get_attribute("src") or img_el.get_attribute("data-src")
                    
                    # 抓取標題：尋找包含標題文字的 div 或 p
                    title = node.inner_text().split('\n')[0].strip()

                    if title and img_url and len(title) > 5:
                        if img_url.startswith("//"):
                            img_url = "https:" + img_url
                        
                        data_list.append({
                            "title": title,
                            "image_url": img_url,
                            "category": "紙棉用品"
                        })
                except:
                    continue

            # 寫入資料庫
            if data_list:
                # 簡單去重
                unique_data = {v['title']: v for v in data_list}.values()
                print(f"💾 準備寫入 {len(unique_data)} 筆商品到 Supabase...")
                supabase.table("poya_items").upsert(list(unique_data), on_conflict="title").execute()
                print("✅ 寫入成功！")
            else:
                print("❌ 依然沒抓到商品。請確認 Table 'poya_items' 的 title 欄位是否設為 Primary Key。")

        except Exception as e:
            print(f"❌ 執行出錯: {e}")
        
        browser.close()

if __name__ == "__main__":
    scrape()
