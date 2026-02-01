import os
from playwright.sync_api import sync_playwright
from supabase import create_client

# 直接讀取你專案已有的環境變數（在 GitHub Actions 中設定）
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 寶雅正確的分類 ID
CATEGORIES = {
    "紙棉用品": "260",
    "居家清潔": "261",
    "生活雜貨": "262",
    "生活用品": "263"
}

def scrape_poya():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 模擬手機版瀏覽器通常比較好爬，結構也簡單
        context = browser.new_context(user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1")
        page = context.new_page()

        for cat_name, cat_id in CATEGORIES.items():
            url = f"https://www.poyabuy.com.tw/v2/official/SalePageCategory/{cat_id}"
            print(f"正在抓取 {cat_name}...")
            page.goto(url)
            
            # 等待商品卡片載入
            page.wait_for_timeout(5000)

            # 滾動幾次以獲取更多商品
            for _ in range(3):
                page.mouse.wheel(0, 2000)
                page.wait_for_timeout(1000)

            # 根據寶雅目前的 DOM 結構抓取
            products = page.locator(".product-card-m").all()
            
            data_list = []
            for item in products:
                try:
                    title = item.locator(".product-card-m__title").inner_text()
                    img_url = item.locator("img").get_attribute("src")
                    
                    if title and img_url:
                        data_list.append({
                            "title": title,
                            "image_url": img_url,
                            "category": cat_name
                        })
                except:
                    continue
            
            # 批次寫入 Supabase (UPSERT 避免重複)
            if data_list:
                supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                print(f"✅ {cat_name} 抓取完成，存入 {len(data_list)} 筆")

        browser.close()

if __name__ == "__main__":
    scrape_poya()
